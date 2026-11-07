# Engine integration

How `@damm/engine` plugs into the employee app, the HR dashboard and the jobs. The model itself is described in [engine.md](engine.md). Question types are in [question-types.md](question-types.md).

Status (2026-11-07): implemented on `natan/engine-core`: the daily batch, answer submission, the job (aggregates, insights and alarms), HR config and question validation. Not yet: the `driver` and `action_effect` insights, alarm notifications (digest and push), and non-response handling.

## Big picture

```
 employee app (PWA)                       HR dashboard
   │  GET /api/pool/next                    │  reads only aggregate tables
   │  POST /api/responses                   │  writes HR config (weights, formats)
   ▼                                        ▼
 @damm/engine           @damm/engine/hr     @damm/db/hr (Jan)
 getDailyBatch          validateQuestion    agregat, insight, senyal,
 submitAnswers          setDomainWeight     domain_importance
   │                    setFormatPreference       ▲
   │ per-account state  setConfig                 │ aggregates only, n ≥ 10
   ▼                                              │
 SQLite: assignment, person_domain_state,  ── @damm/engine/job: runEngineJob
         resposta, item_stats, format_stats      (POST /api/jobs/run or script)
```

Rules that do not change:
- **One process, one SQLite file.** The engine takes the same `better-sqlite3` `Database` the app uses (dependency injection). It has no dependencies of its own and opens no connections.
- **The engine is the only reader of per-account state.** HR code imports only `@damm/engine/hr`, never `@damm/engine` or `@damm/engine/job`. Add this to the anonymity lint and to `scripts/check-anonymity.mjs`.
- **No LLM in any request path.** The engine is pure statistics and runs in milliseconds.
- **Deterministic.** Randomness comes from a seeded RNG (seed = account and day for batches), so the same state gives the same output. Tests and demos are reproducible.

## Entry points

| Import | Who uses it | What |
|---|---|---|
| `@damm/engine` | employee API routes | `createEngine`, `getDailyBatch`, `submitAnswers` |
| `@damm/engine/job` | job route and script | `runEngineJob` |
| `@damm/engine/hr` | HR routes | `validateQuestion`, `setDomainWeight`, `setFormatPreference`, `getConfig`, `setConfig` |
| `@damm/engine/core` | tests, simulations | pure functions (normalise, Kalman, segment stats, Thompson) |

## Employee app

### `GET /api/pool/next`

The route resolves the account from the session (never from a parameter) and calls:

```ts
import { createEngine } from "@damm/engine";

const engine = createEngine({ db, redact }); // once per process
const batch = engine.getDailyBatch(accountId); // now defaults to Date.now()
return Response.json(batch);
```

`DailyBatch`:

```ts
{
  day: "2026-11-07",
  total: 3,
  answered: 1,
  items: [
    {
      assignmentId: 812,
      questionId: 41,
      domainId: 2,
      type: "scale10",                    // QuestionType
      text: "From 0 to 10, how much does your manager listen to you?",
      options: null,                      // pair/choice/ranking: [{ label }] in display order. Scores are NOT sent to the client
      scale: { min: 0, max: 10 },         // scale5/scale10 only
      isFollowup: false,
      answered: false
    }
  ]
}
```

Behaviour:
- **The same batch all day.** The first call of the day generates and stores it in `assignment`; later calls return it with `answered` flags updated. No timeouts.
- **Order:** follow-up first, then the HR need, then monitoring.
- An empty `items` array means there are no eligible questions (empty pool). The UI shows "nothing today".

### `POST /api/responses`

The route validates the body shape with zod, then calls:

```ts
const result = engine.submitAnswers(accountId, body.respostes, { channel: body.canal });
```

`RespostaInput` (from `@damm/shared`):

| Type | Fields |
|---|---|
| `scale5` | `valorNum` 1..5 (integer) |
| `scale10` | `valorNum` 0..10 (integer) |
| `yes_no` | `valorNum` 0 or 1 |
| `pair` | `valorNum` = option index 0..1 |
| `choice` | `valorNum` = option index |
| `ranking` | `valueJson` = all option indices, best first, each exactly once |
| `open` | `comentari` required |

All types also take an optional `comentari` and an optional `answerMs` (time from display to answer).

`SubmitResult`:

```ts
{ accepted: [41], rejected: [{ questionId: 99, reason: "not_in_todays_batch" }], remainingToday: 2 }
```

Rejection reasons:
- `not_in_todays_batch`
- `already_answered`
- `invalid_value`
- `missing_comment` (open questions only)

What the engine does in one transaction per answer:
1. Checks that the question is in today's batch and not answered yet.
2. Validates the value for the type.
3. Redacts the comment with the injected `redact` function.
4. Computes `score` and inserts the `resposta` row, including `score`, `value_json` and `answer_ms`.
5. Updates `item_stats`, `person_domain_state` (which may schedule a follow-up) and `format_stats`, and marks the `assignment` answered.

`redact` is injected by the app, so the PII redaction logic stays where the AI module owns it. The engine refuses to start without it.

## HR dashboard

Reads (through `@damm/db/hr`, Jan's repositories), aggregate tables only:

| Table | Content | Written by |
|---|---|---|
| `agregat` | per period × collective × shift × domain: `n`, `mitjana` (1..5, legacy scale, kept for the existing pages), `score` (0..10), `confidence` (0..100), `consensus` (0..100), `suprimit` | engine job |
| `domain_importance` | importance per domain from rankings | engine job |
| `insight` | insight cards (section 6 of engine.md) | engine job (`runInsights`, called by the job) |
| `senyal` | alarms with severity, status, audience | engine job (`runAlarms`, called by the job) + analysis (themes) |

Display rules:
- **Suppressed rows** (`suprimit = 1`) have every value NULL. Show "n < 10" and nothing else.
- **Low confidence:** show the score faded with its confidence, for example "6.8 · confidence 42".
- **Consensus:** show next to the score; a low value means the group is split.

Writes (HR routes, through `@damm/engine/hr`):
- `validateQuestion(q)` before approving a question. It checks the type, `options_json` (scores in 0..1 for pair/choice, `domain_id` for ranking, 2 options for pair, 3–5 for choice/ranking), polarity and facet. Returns `{ ok: true }` or `{ ok: false, errors: string[] }`.
- `setDomainWeight(db, { collectiuId | null, dominiId, weight })`: weight > 0. All domains stay active.
- `setFormatPreference(db, { collectiuId | null, type, weight })`: weight ≥ 0; 0 = never shown to that collective.
- `getConfig(db)` and `setConfig(db, patch)` for `engine_config` (unknown keys rejected).

## Jobs

```ts
import { runEngineJob } from "@damm/engine/job";
const report = runEngineJob(db, { now: Date.now() });
// { periods: ["2026-08","2026-09","2026-10"], aggregates: 312, suppressed: 41, insights: { written: 540, suppressed: 96 }, alarms: { opened: 3, resolved: 1, suppressed: 0 } }
```

Run it:
- from `POST /api/jobs/run` (HR-only route);
- from the script `pnpm --filter @damm/engine run job` (uses `DB_PATH`, default `data/app.db`);
- after seeding, so the dashboard has data.

The job is idempotent: it recomputes and replaces its own rows for the periods it covers.

## Seeded data

The engine works with the seed as it is:
- **No `facet`:** items without a facet are treated as their own facet.
- **Old `resposta` rows without `score`:** the job computes the score on the fly.
- **Rebuilding state:** `runEngineJob` rebuilds `person_domain_state` and `item_stats` from `resposta` if they are empty, so seeded history produces trajectories and aggregates.

## Versioning

- `ENGINE_VERSION` (exported) is written to `engine_config.engine_version` by every job, so a demo can show which model produced the numbers.
- Changes to this API are logged in [contract-changes.md](contract-changes.md).
