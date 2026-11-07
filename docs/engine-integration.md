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
| `@damm/engine/job` | server startup, job route, script | `runEngineJob`, `startEngineScheduler` |
| `@damm/engine/hr` | HR routes and pages | `listInsights`, `listAlarms`, `alarmCounts`, `setAlarmStatus`, `validateQuestion`, `setDomainWeight`, `setFormatPreference`, `startProbe`, `listProbes`, `stopProbe`, `getConfig`, `setConfig` |
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

## Comment analysis

```ts
import { runCommentAnalysis, runCommentAnalysisSync } from "@damm/engine/job";
runCommentAnalysisSync(db, { now: Date.now() });                        // lexicon + templates, no network
await runCommentAnalysis(db, { now: Date.now(), classify, summarise }); // optional LLM, functions from @damm/ai
```

Run it after `runEngineJob`. It is called by `scripts/job.ts` (deterministic), by the demo build, and by `pnpm --filter @damm/engine run comments`, which uses the LLM when `LLM_BASE_URL` and `LLM_API_KEY` are set (`--no-llm` to skip) and falls back to the rules otherwise. `runEngineJob` itself is unchanged. `POST /api/jobs/run` should call `runCommentAnalysisSync` right after `runEngineJob` (it needs no key).

It rewrites `tema` and `comentari_tema` (replacing the seeded rows) and opens `emergent` alarms in `senyal`. `tema` has one row per theme x period x collective (`collectiu_id`, NULL = company), with `clau`, `share` and `font`. Suppressed rows (`suprimit = 1`) have no `resum`, `share` or comment links: show nothing for them. Sensitive themes have no comment links. The LLM helpers are `classifyCommentsLlm` and `summariseThemeLlm` in `@damm/ai`. Design, accuracy and limits: [engine.md](engine.md) section 12.

## Running the engine on the server

The engine is a library inside the Next.js server process, not a separate service:

| Work | When | How |
|---|---|---|
| Daily batch | each `GET /api/pool/next` | `getDailyBatch` |
| Learning from an answer (trajectory, item bias, format stats, follow-up scheduling) | each `POST /api/responses`, immediately | `submitAnswers` |
| Aggregates, insights, alarms | periodically, and on demand | `startEngineScheduler` runs `runEngineJob` every 10 minutes |

Start the scheduler once per server process, in `apps/web/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startEngineScheduler } = await import("@damm/engine/job");
  const { getDb } = await import("@damm/db"); // the app's shared better-sqlite3 connection
  const g = globalThis as { __engineScheduler?: unknown };
  // Dev hot reload re-runs register(): keep a single scheduler.
  g.__engineScheduler ??= startEngineScheduler(getDb(), {
    intervalMs: 10 * 60_000,
    onError: (e) => console.error("[engine] job failed", e),
  });
}
```

Behaviour:
- **Runs:** once at start (`runOnStart`, default true), then every `intervalMs`. Runs never overlap.
- **Failures:** a failed run is reported to `onError` and the next tick tries again.
- **Shutdown:** the timer does not keep the process alive.
- **On demand:** `scheduler.runNow()` runs immediately, for an HR "Recalculate now" button. It returns `null` if a run is already in progress.
- **Cost:** the job is synchronous and replays all answers. At the demo's scale (about 1,000 people, a few thousand answers) it takes well under a second. For much larger data, move it to a worker thread or a separate process; the API stays the same.

## Reading insights and alarms (HR dashboard)

HR pages read through `@damm/engine/hr` (or through `@damm/db/hr` wrapping it). Both functions take a **viewer**:

```ts
type Viewer = { role: "hr" } | { role: "manager"; collectiuId: number };
```

The route resolves the viewer from the session, never from a request parameter. HR sees everything. A manager sees only their own collective, and only alarms with `audience = 'hr_manager'`, so Lideratge alarms are never shown to managers.

### Insights

```ts
import { listInsights } from "@damm/engine/hr";
const cards = listInsights(db, viewer, { kind: ["top_mover", "importance_gap"], collectiuId: 1 });
```

Query options:
- `periode`: defaults to the latest; `"all"` returns every period;
- `kind`: one or several;
- `collectiuId`: `null` = company-wide rows only;
- `domainId`;
- `includeSuppressed`: default false. When true, suppressed rows come back with `value` and `detail` null, so the UI can show "not enough answers (n < 10)".

Each `InsightView` has `id`, `kind`, `periode`, `collectiuId`, `tornId`, `domainId`, `n`, `value`, a typed `detail` and `suppressed`. The `InsightDetails` type in `@damm/engine/hr` gives the exact shape per kind, and every `detail` has `labels: { collective, shift, domain }` for display.

| `kind` | `value` (headline) | `detail` (beyond `labels`) | Card idea |
|---|---|---|---|
| `domain_state` | score 0..10 | `current` and `previous` snapshots (score, confidence, consensus, n), `delta` | score tile with a confidence bar and consensus |
| `top_mover` | change in score | `rank`, `direction` up/down, `current`, `previous`, `delta` | "biggest changes" list |
| `polarisation` | consensus drop (points) | `current`, `previous`, `consensusDrop`, `scoreDelta` | "the group is splitting" warning |
| `importance_gap` | priority 0..1 | `importance`, `score`, `priority`, `rank`, `quadrant` (`act_first`, `maintain`, `monitor`, `low_priority`), `importanceN` | importance vs satisfaction quadrant |
| `trajectory_mix` | % declining | `improving`, `stable`, `declining` (%), `windowDays`, `n` | stacked bar |
| `followup_confirmation` | % confirmed | `resolved`, `confirmed`, `confirmedDown`, `confirmedUp`, `rate`, `n` | "real change or noise?" |
| `segment_gap` | gap in score | `dimension: "shift"`: `lowest`, `highest`, `groups[]`, `gap`. `dimension: "manager"`: `managers`, `others`, `gap`, `asOf` | side-by-side bars |

`driver` and `action_effect` are reserved but not produced yet.

### Alarms

```ts
import { listAlarms, alarmCounts, setAlarmStatus } from "@damm/engine/hr";
const alarms = listAlarms(db, viewer); // unresolved, visible to this viewer
const badge = alarmCounts(db, viewer); // { critical, warning, info }
setAlarmStatus(db, id, "acknowledged"); // HR route only
```

`AlarmView` fields:
- `id`, `type`;
- `description`: a sentence ready to display (English; Catalan for `baixa_participacio`);
- `collectiuId`, `tornId`, `domainId`, `periode`, `n`, `confidence`;
- `severity`, `status`, `audience`, `createdAt`.

Query options:
- `status`: defaults to everything except `resolved`;
- `severity`, `collectiuId`, `domainId`, `limit`.

Suppressed alarms (n < 10) are never returned. Order: open first, then critical before warning before info, then newest first.

Status changes:

| From | Allowed to |
|---|---|
| `open` | `acknowledged`, `action_linked`, `resolved` |
| `acknowledged` | `action_linked`, `resolved` |
| `action_linked` | `resolved` |
| `resolved` | none (if the problem returns, the engine opens a new alarm after its 7-day cooldown) |

- **HR** makes these changes. `setAlarmStatus` throws `AlarmTransitionError` on any other move.
- **The engine** only opens alarms and auto-resolves alarms that are still `open`. It never changes one a human has moved.

### Probes (Indagar)

An "Indagar" button on the signal page, next to the recommendations, asks the engine to sample that alarm's domain more in its segment for a while.

```ts
import { startProbe, listProbes, stopProbe, ProbeError } from "@damm/engine/hr";
// HR-only route. Segment and domain come from the alarm.
const probe = startProbe(db, { senyalId: alarm.id, collectiuId: alarm.collectiuId, tornId: alarm.tornId, dominiId: alarm.domainId, boost: 2, days: 14 });
const probes = listProbes(db, { senyalId: alarm.id }); // newest first, with status and progress
stopProbe(db, probe.id);
```

- `startProbe` needs a collective (an alarm with no collective cannot be probed). It throws `ProbeError` for a segment under 10 people, a second active probe on the same segment and domain, or a bad boost or number of days: show `error.message`.
- `ProbeView`: `id`, `senyalId`, `collectiuId`, `tornId`, `dominiId`, `boost`, `startsAt`, `endsAt`, `stoppedAt`, `status` (`active`, `expired`, `stopped`), `daysLeft`, `progress`.
- `progress` is `null` until the next engine job run (at most 10 minutes). Then: `answers`, `answersBefore`, `extraAnswers`, `people`, `confidenceBefore`, `confidenceNow`, `scoreBefore`, `scoreNow`, `updatedAt`. If `progress.suppressed`, every number is null: show "not enough answers yet (fewer than 10 people)".
- Suggested UI: a "Digging deeper" card with days left, "+N answers", "confidence 42 → 61" and a Stop button. Never show anything per person.
- Employee side: nothing changes. `GET /api/pool/next` already picks questions through the scheduler.

### Getting alarms to the screen

- **Today:** alarms are written by each job run, at most every 10 minutes. The dashboard picks them up when it reads, so a page load or a 60-second poll of `alarmCounts` for the header badge is enough for the demo.
- **Planned:** a weekly digest of warnings and an immediate push or email for critical alarms. These will be an `onReport` hook on the scheduler (`report.alarms.opened > 0`). Not built yet.

## Narrative insights

An LLM briefing per collective and company-wide: a 3 to 5 sentence summary, 2 to 4 highlights with their evidence, and 1 to 3 suggested actions, each with a follow-up survey idea. AI proposes, a human decides: actions are written to `recomanacio` as `proposada`.

**When it runs.** After the engine job, on demand or a few times a day at most (`pnpm --filter @damm/engine run narrative`, which reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` from the environment or the repo root `.env`, and `DB_PATH`). It is **not** part of `runEngineJob` or the scheduler, and the LLM is never called from a dashboard request. From code: `runNarrative(db, { now, complete, periode? })` from `@damm/engine/job`, with `complete` from `createComplete()` in `src/llm.ts` (tests pass a fake).

**Reading it.**

```ts
const [card] = listInsights(db, viewer, { kind: "narrative", collectiuId: null }); // company-wide
if (card?.kind === "narrative" && card.detail) card.detail.summary; // typed: highlights, suggestedActions, model, ...
```

`detail.suggestedActions[i].recommendationId` is the `recomanacio.id` created for it, `alarmId` the open alarm it addresses (or null). Managers only get their own collective, like every insight.

**What the model receives** (per segment, only if at least 10 people answered in the period): domain scores, confidence, consensus, previous score and change (only `agregat` rows with n of at least 10, no shift rows); up to 8 open alarms (id, type, severity, domain, engine description); up to 3 top movers, 2 polarisation and 3 `act_first` insights; and at most 40 redacted comments (300 characters each) with their domain name only, taken round-robin over domains that have a visible aggregate. No account ids, dates, shifts or counts below 10.

**Idempotent and cheap.** The input is hashed (with the model and prompt version). If the stored narrative has the same `inputHash`, the segment is skipped with no LLM call. A changed input replaces the narrative row and deletes only the recommendations it proposed that are still `proposada`; `aprovada` and `descartada` ones are never touched, and an action whose title matches one a human already decided is not proposed again. A failed call (after 2 retries in the client and one re-ask on unusable output) keeps the old row. One run is at most 5 calls, one per segment (company + 4 collectives), more only on retries.
## Recommendations

Job code only, never a request handler:

```ts
import { runEngineJob, runRecommendations } from "@damm/engine/job";
import { draftRecommendations } from "@damm/ai";

runEngineJob(db);
await runRecommendations(db, { now: Date.now(), draft: (ctx) => draftRecommendations(ctx) });
```

It inserts `recomanacio` rows (`estat = 'proposada'`, `senyal_id`, `titol`, `iniciativa`, `responsable_suggerit`, `termini_suggerit`, `justificacio`, `limits`, `font`) for open alarms that have none. Safe to re-run. `pnpm --filter @damm/engine run job` and the demo builder already do this (template mode unless an LLM key is set). Show the fields on the signal page; HR only approves or discards, there is no "done" state. See contract change C11.

## Seeded data

The engine works with the seed as it is:
- **No `facet`:** items without a facet are treated as their own facet.
- **Old `resposta` rows without `score`:** the job computes the score on the fly.
- **Rebuilding state:** `runEngineJob` rebuilds `person_domain_state` and `item_stats` from `resposta` if they are empty, so seeded history produces trajectories and aggregates.

## Versioning

- `ENGINE_VERSION` (exported) is written to `engine_config.engine_version` by every job, so a demo can show which model produced the numbers.
- Changes to this API are logged in [contract-changes.md](contract-changes.md).

## Demo data

`pnpm --filter @damm/engine run demo` builds `data/demo.db` from scratch, in about 4 minutes. It is separate from the seed's `data/app.db`, so nothing of Jan's is overwritten. Run the app on it with `DB_PATH=data/demo.db pnpm dev`.

What it contains (all synthetic):
- **Population:** 1,200 invented employees across the 4 collectives and 3 shifts, of whom 344 have accounts. Night shifts are deliberately thin.
- **Questions:** the 163-question sample bank, plus one published HR need ("shift-change communication" for Fàbriques, two questions).
- **Format preferences per collective:** quick formats for Fàbriques and Logística, reading formats for Oficines.
- **Answers:** 92 days (1 Aug to 31 Oct 2026) of daily batches, answered through the real engine, about 95,000 answers of every type including rankings.
- **Comments:** about 20,000 English template comments, with recurring themes (see below).
- **Results:** at the end it runs `runEngineJob`, so `agregat`, `domain_importance`, `insight` and `senyal` are filled.

Planted stories and what they produce:

| Story | Where | Shows up as |
|---|---|---|
| Shift changes announced too late, from 1 Oct | Fàbriques, Condicions | `sharp_drop` (critical), `top_mover`, theme comments |
| Heat and safety equipment, slow decline from mid-August | Logística, Condicions | `sustained_decline`, theme comments |
| A group of people whose view of their supervisor collapses, from 14 Oct | Logística morning shift, Lideratge | follow-ups, `changepoint_cluster` (critical, HR only), `followup_confirmation` |
| The team splits in two, average unchanged, from 1 Oct | Oficines, Entorn i relacions | `polarisation` alarm and insight |
| Managers answer more positively | everywhere | `segment_gap` (manager) |
| Few night-shift accounts | Fàbriques and Logística night | suppressed segments (n < 10), `baixa_participacio` warning on the night shifts with at least 10 respondents (the demo uses `participationScale` 1.6 so the other shifts sit above the 40% rate) |

The run is deterministic: the same seed gives the same database. `--seed` changes it, and `--days` makes it shorter.
