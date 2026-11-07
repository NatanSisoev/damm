# Shared contract change log

Every change to the shared contract (`packages/db/schema.sql`, `packages/shared`, or an API the other person calls) gets an entry here, **newest first**, in the same commit as the change.

**How agents use this file** (also in AGENTS.md, Sync rules):
1. After every sync or pull, read every entry that still has open items (`- [ ]`) for your person.
2. Apply the item in your area, tick it (`- [x]`) and append `(done YYYY-MM-DD, <short commit>)`.
3. If an item cannot be applied yet, leave it open and tell your user why.
4. Only tick your own items. Never delete entries.

Entry format:

```
## C<n> · YYYY-MM-DD · <author> · <title>
What changed and why.
- [ ] Jan: action
- [ ] Natan: action
```

---

## C7 · 2026-11-07 · Natan · `baixa_participacio` alarm is now emitted

No schema or API change. `runAlarms` now writes `senyal` rows with `tipus = 'baixa_participacio'`:
- one per collective × shift (collective alone where it has no shifts), `domini_id` NULL, severity `warning`, audience `hr`;
- triggers when the response rate (distinct respondents in the period over the synthetic population) is under 40%, or the segment's share of respondents is under 0.7 × its population share; clears at 45% and 0.8;
- `descripcio` is a Catalan sentence, e.g. "Participació baixa al torn de nit de Fàbriques: 22% (n=18 de 82). ...", and `n` is the respondent count;
- segments with a population or respondents under 10 are suppressed like every other alarm type.
The demo builder now uses `participationScale` 1.6 so only the thin shifts trigger it.

Action items:
- [ ] Jan: show `baixa_participacio` alarms as an explicit representativeness warning banner on results/need pages (R-SC-A5, R-SC-B3)

## C6 · 2026-11-07 · Natan · Demo database, question bank, simulator

No schema or API change.
- **Demo database:** `pnpm --filter @damm/engine run demo` builds `data/demo.db` with three months of synthetic answers and planted stories, so every insight card and most alarm types have real data. See [engine-integration.md](engine-integration.md), "Demo data".
- **Question bank:** `packages/engine/fixtures/question-bank.json` holds 163 English sample questions in every type, loadable with `loadQuestionBank(db)`.
- **Simulator:** `packages/engine/sim/` checks the engine against known ground truth.
- **Engine speed:** segment statistics are now cached per collective per day, so batch requests no longer scan every person.

Action items:
- [ ] Jan: build the demo DB once and check every HR page with `DB_PATH=data/demo.db`. The cards and alarms listed in "Demo data" should all appear.
- [ ] Jan (optional): use `loadQuestionBank` in the seed instead of the old Catalan bank, if you want English questions there too.

## C5 · 2026-11-07 · Natan · Read API for insights and alarms, job scheduler

New in `@damm/engine/hr`:
- `listInsights(db, viewer, query)`: typed insight cards, with the `InsightDetails` type giving the exact `detail` shape per kind;
- `listAlarms(db, viewer, query)`;
- `alarmCounts(db, viewer)`;
- `setAlarmStatus(db, id, status)`, which only allows the human transitions.

`viewer` is `{ role: "hr" }` or `{ role: "manager", collectiuId }`. Managers see only their own collective, and only `audience = 'hr_manager'` alarms.

New in `@damm/engine/job`: `startEngineScheduler(db, { intervalMs })` runs the job every 10 minutes (default) inside the server process. `runNow()` serves a "Recalculate now" button.

Full contract, the card table and an `instrumentation.ts` snippet: [engine-integration.md](engine-integration.md), sections "Running the engine on the server" and "Reading insights and alarms". No schema change.

Action items:
- [ ] Jan: start the scheduler once in `apps/web/instrumentation.ts`, as in engine-integration.md, with the app's shared DB connection.
- [ ] Jan: HR pages read insights and alarms only through `listInsights`, `listAlarms` and `alarmCounts`, with the viewer taken from the session. Status buttons call `setAlarmStatus` from an HR-only route.
- [ ] Jan: header badge from `alarmCounts` (poll every ~60 s or refresh on page load).
- [ ] Jan (optional): a "Recalculate now" button calling `scheduler.runNow()` from an HR-only route.

## C4 · 2026-11-07 · Natan · Engine job writes insights and alarms

`runEngineJob` now also calls `runInsights` and `runAlarms`, so one job run fills `agregat`, `domain_importance`, `insight` and `senyal`. `JobReport.insights` and `JobReport.alarms` are objects with counts instead of `"pending"`. No schema change.

What the dashboard reads:
- **`insight`:** kinds `domain_state`, `top_mover`, `polarisation`, `importance_gap`, `trajectory_mix`, `followup_confirmation` and `segment_gap` (`detail_json.dimension` is `"shift"` or `"manager"`). `detail_json` has the labels and previous/current values needed to render a card. Suppressed rows have `value` and `detail_json` NULL.
- **`senyal`:** engine alarm types `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `feble`, `low_confidence` and `improvement`.
  - Each has `severity`, `audience` and `status`.
  - The engine opens alarms and auto-resolves `open` ones. It never touches `acknowledged` or `action_linked` alarms: those statuses are set by HR actions.
  - Lideratge alarms always have `audience = 'hr'`.

Action items:
- [ ] Jan: show the insight cards on the HR results page, reading `insight` through `@damm/db/hr`.
- [ ] Jan: the signals page lists engine alarms with severity and lets HR move them to `acknowledged`, `action_linked` or `resolved`.
- [ ] Jan: managers see only `audience = 'hr_manager'` alarms for their own collective.

## C3 · 2026-11-07 · Natan · `@damm/engine` package

New workspace package `packages/engine` (`@damm/engine`), API as in [engine-integration.md](engine-integration.md). It has no runtime dependencies: the caller injects the SQLite connection (better-sqlite3 in the app, node:sqlite in tests).

- Entry points:
  - `@damm/engine`: `createEngine({ db, redact })`, `getDailyBatch` and `submitAnswers`;
  - `@damm/engine/job`: `runEngineJob(db)`;
  - `@damm/engine/hr`: `validateQuestion`, `setDomainWeight`, `setFormatPreference`, `getConfig` and `setConfig`;
  - `@damm/engine/core`: the pure model.
- `runEngineJob` writes `agregat` (with `mitjana` still on 1..5) and `domain_importance`, fills a missing `resposta.score`, and on a fresh database bootstraps `person_domain_state` and `item_stats` from existing answers.
- `insight` and `senyal` are not written yet (the report says `pending`).
- The root `package.json`, `pnpm-workspace.yaml` and `packages/shared/package.json` on Natan's branch are byte-identical to `jan/dev`, so they merge cleanly.

Action items:
- [ ] Jan: after merging, run `pnpm install` so `pnpm-lock.yaml` picks up `@damm/engine` (its devDependencies are `typescript` and `@types/node`).
- [ ] Jan: add `"@damm/engine": "workspace:*"` to `apps/web` dependencies, and to `transpilePackages` in the Next config if the other workspace packages are listed there.
- [ ] Jan: the C2 items for routing `pool/next`, `responses` and the job through the engine are now unblocked.

## C2 · 2026-11-07 · Natan · English question types, engine integration API

Question (answer) type values are now English. Engine API defined in [engine-integration.md](engine-integration.md). Implementation is in progress on `natan/engine-core`.

| Old (Catalan) | New |
|---|---|
| `escala5` | `scale5` |
| `escala10` | `scale10` |
| `swipe` | `yes_no` (a swipe is still fine as the UI) |
| `obert` | `open` |
| `pair`, `choice`, `ranking` | unchanged |

- `packages/shared`: new `QUESTION_TYPES` constant and `QuestionType` type. `PreguntaTipus` stays as a deprecated alias of `QuestionType`.
- `schema.sql`: the `pregunta.tipus` CHECK uses the new values.
- The engine takes over:
  - question selection for `GET /api/pool/next` (`engine.getDailyBatch`);
  - answer validation and insert for `POST /api/responses` (`engine.submitAnswers`);
  - computing `agregat` (`runEngineJob`, which writes `mitjana` 1..5 as before, plus `score`, `confidence` and `consensus`).

Action items:
- [x] Jan: replace `escala5`/`escala10`/`swipe`/`obert` with `scale5`/`scale10`/`yes_no`/`open` in the seed (`packages/seed/src/questions.ts`, `seed.ts`), `employee-repository.ts` and the answer UI (`question-renderer.tsx`, `answer-flow.tsx`). (done 2026-11-07, d3b4db5)
- [ ] Jan: once `@damm/engine` is on main, route `GET /api/pool/next` and `POST /api/responses` through `createEngine({ db, redact })` (engine-integration.md), and drop the selection and validation logic in `employee-repository.ts`.
- [ ] Jan: stop writing `agregat` in `packages/db/src/init.ts` and call `runEngineJob(db)` after seeding instead.
- [x] Jan: add `@damm/engine` and `@damm/engine/job` to the HR import ban and to `scripts/check-anonymity.mjs`. HR code may import only `@damm/engine/hr`. (done 2026-11-07, f47df99)

## C1 · 2026-11-07 · Natan · Engine tables, new question types, alarms

Design: [engine.md](engine.md). Examples of every type: [question-types.md](question-types.md).

All changes are additive: nothing was renamed or removed, and new TypeScript fields are optional.

- **`pregunta`:**
  - new types `pair` (this or that) and `choice` (pick the most representative statement);
  - new columns `facet` (interchangeable wordings), `polarity` (1 or -1; -1 = negatively worded), `options_json` (pair/choice `[{label, score}]`, ranking `[{label, domain_id}]`) and `is_followup`.
- **`resposta`:**
  - new columns `value_json` (ranking order, option indices, best first), `score` (engine-normalised 0..1, 1 = best, set only by the engine) and `answer_ms`;
  - `valor_num` for pair/choice is the chosen option index;
  - `v_resposta_analitica` now also exposes `score`, and still has no `compte_id`.
- **`agregat`:** new engine columns `score` (0..10), `confidence` and `consensus` (0..100). `mitjana` is unchanged (1..5). Suppressed rows must have all of them NULL.
- **`senyal`:**
  - new types `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `low_confidence` and `improvement`;
  - new columns `torn_id`, `domini_id`, `severity`, `status`, `audience` (Lideratge alarms always `hr`) and `created_at`.
- **New tables:**
  - engine-only, per account: `assignment` (daily batch) and `person_domain_state`;
  - engine state: `item_stats` and `format_stats`;
  - HR config: `domain_weight`, `format_preference` and `engine_config`;
  - aggregates for the dashboard: `insight` and `domain_importance`.
- **`GET /api/pool/next`:** returns today's fixed batch of 3 questions, including `options`. No timeouts.
- **`packages/shared`:** new alarm and insight types, `ScoredOption`, `RankingOption`, `Insight`, and optional fields on `Pregunta`, `RespostaInput`, `Agregat` and `Senyal`.

Action items:
- [ ] Jan: ranking items in the seed need `options_json` with a `domain_id` per option; give items a `facet`.
- [x] Jan: the answer UI renders `pair` and `choice` from `options`. (done 2026-11-07, d3b4db5)
- [x] Jan: `POST /api/responses` accepts `valueJson` and `answerMs`. (done 2026-11-07, d3b4db5)
- [x] Jan: add `assignment` and `person_domain_state` to `scripts/check-anonymity.mjs` as forbidden for HR code. (done 2026-11-07, f47df99)
- [x] Jan: the HR signals page handles the new `senyal` types, `severity` and `status`. (done 2026-11-07, 355c13c)
- [ ] Jan (optional): the results page shows `confidence` and `consensus` next to each score.
