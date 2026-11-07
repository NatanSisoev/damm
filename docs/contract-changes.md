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

## C12 · 2026-11-07 · Jan · NeedCard carries dates, per-question answer counts and participation

`NeedCard` (`@damm/db/hr`, read-only HR type) gains `publicat`, `responses`, `population`, `publications[].creat` and `approved[].answers`. Counts come from `v_resposta_analitica` and are `null` under the minimum group size. No schema change.

- [x] Jan: the Necessitats page shows them (done 2026-11-07).
- [x] Natan: nothing to do.

## C11 · 2026-11-07 · Jan · HR respondent counts fall back to per-domain aggregates

- `@damm/db/hr` `getRepresentativeness()` and `getHrOverview()` no longer require `agregat` rows with `domini_id IS NULL`. They use those rows when present and otherwise the largest per-domain `n` of each (collective, shift) as a lower bound of distinct respondents (`segmentCounts` in `hr-repository.ts`).
- Why: `packages/engine/src/job.ts` writes per-domain rows only, so on an engine-built DB Inici showed "—" for participation and every segment showed "Suprimit · Menys de 10 persones han respost" even with n=80 (`docs/hr-ui-audit.md` HR-X-1, HR-ENG-1). No schema change.

Action items:
- [x] Jan: HR side fallback (done 2026-11-07).
- [ ] Natan: in `snapshot` of `job.ts`, emit per (collective, shift) and company-level rows with `domini_id = NULL` and `n` = distinct respondents across domains (the `respondents` sets and `count()` already exist). Then the fallback is no longer used and `n` is exact.

---

## C10 · 2026-11-07 · Jan · Published needs are added to today's batch past the cap

- New in `@damm/db/employee`: `addPublishedNeedsToDay(compteId, day)`. For an account whose batch for `day` already exists, it appends every approved, non-follow-up question of a `publicada` need for the account's collective (or all collectives) that the account never answered and that is not in today's batch, as extra `assignment` rows (`reason='need'`, slots after the engine's). `apps/web/lib/engine.ts` `getTodaysBatch` calls it after `getDailyBatch`; `GET /api/pool/next` uses `getTodaysBatch`.
- Why: Jan wants an employee who logs in or taps the push after a publish to see that need's questions at once. The engine freezes the day's batch on the first request and caps needs at `maxNeedsPerDay` (1) and the day at `questionsPerDay` (3), so a need published later only showed up tomorrow, one question a day.
- No schema change. This is a second writer of the engine-owned `assignment` table, from the web layer.

Action items:
- [ ] Natan: in `approvedQuestionsFor` / `selectBatch`, serve need questions only when their `necessitat` is `publicada` (today an `aprovada` question is served while the need is still `oberta`, before HR publishes; seen in the browser 2026-11-07).
- [ ] Natan: in `getDailyBatch`, top up an existing day's batch with unanswered questions of `publicada` needs, past `questionsPerDay` and `maxNeedsPerDay`; then tell Jan so `addPublishedNeedsToDay` and `getTodaysBatch` can be removed.

## C9 · 2026-11-07 · Jan · Publishing a need sends web push, no per-need join code

- `publishNecessitat(necessitatId)` in `@damm/db/hr` no longer takes a base URL, no longer creates `joincode` or `publicacio` rows, and returns `boolean` (false when the need is not `oberta` or has no approved question). Join codes stay per collective for onboarding (`/hr/publish`).
- New in `@damm/db/employee`: `savePushSubscription`, `hasPushSubscription`, `listPushTargetsForNecessitat` (endpoints and keys for the need's collective, or all), `deletePushSubscriptionByEndpoint`. HR code never imports them; it calls `notifyNeedPublished(id)` in `apps/web/lib/push.ts` and gets an aggregate device count only.
- No schema change. The engine still serves every `aprovada` question whatever the need's state.

Action items:
- [ ] Natan: none required; FYI if the engine or seed ever relied on a `publicacio` row per need.

## C8 · 2026-11-07 · Natan · Scheduler runs the narrative, engine hardening

- `startEngineScheduler(db, { narrative: { complete: createComplete() } })` runs the LLM narrative after the job, at most every 6 hours (`everyMs`), in the background. It never blocks or breaks the job. Without the option the LLM is never called. `runNarrativeNow()` serves an HR "Regenerate summary" button. `createComplete` and `llmConfigFromEnv` are exported from `@damm/engine/job`.
- Engine fixes and tests are merged; see the PR. `pnpm --filter @damm/engine run health` checks a live DB.
- The job and narrative scripts resolve a relative `DB_PATH` from where they're run, else from the repo root, and never create a new database file.

Action items:
- [x] Jan: in `instrumentation.ts`, pass `narrative: process.env.LLM_API_KEY ? { complete: createComplete() } : undefined` to `startEngineScheduler`. (done 2026-11-07, 978fe61; wired in `apps/web/lib/engine.ts`, where the scheduler starts)
- [x] Jan: rebuild existing databases (the `insight.kind` CHECK now includes `narrative`, see C7). (done 2026-11-07, 978fe61; `data/demo.db` rebuilt, existing DBs must be rebuilt)

## C7 · 2026-11-07 · Natan · Narrative insights (LLM summaries and proposed recommendations)

New `insight.kind = 'narrative'` (CHECK in `packages/db/schema.sql`, `InsightKind` in `packages/shared`, `InsightDetails.narrative` in `@damm/engine/hr`). One row per period × segment: company-wide (`collectiu_id` NULL) and one per collective. `detail` has `summary`, `highlights`, `suggestedActions`, `recommendationIds`, `model`, `inputHash`. Each suggested action is also inserted into `recomanacio` with `estat = 'proposada'` (and `senyal_id` when it clearly matches an open alarm). Nothing runs automatically yet: `runNarrative` is exported from `@damm/engine/job` but not called by `runEngineJob` or the scheduler; Natan wires it later. Existing databases need the new CHECK: rebuild with `pnpm --filter @damm/db run init` or the demo builder. Details: [engine-integration.md](engine-integration.md), "Narrative insights".

Action items:
- [x] Jan: show the narrative card (summary, highlights, suggested actions) from `listInsights(db, viewer, { kind: "narrative" })`, company-wide on the overview and per collective on its page. Handle the case where there is no narrative row yet. (done 2026-11-07, 978fe61; overview and results, per collective via the heatmap segment selection; empty state "Encara no hi ha resum del motor")
- [x] Jan: list `recomanacio` rows with `estat = 'proposada'` with Approve and Discard buttons (HR-only route, updates `estat` to `aprovada` / `descartada`). The engine never changes a recommendation a human has decided on. Label them as AI proposals. (done 2026-11-07, 978fe61; labelled "Proposta de la IA · decideix una persona")

## C6 · 2026-11-07 · Natan · Demo database, question bank, simulator

No schema or API change.
- **Demo database:** `pnpm --filter @damm/engine run demo` builds `data/demo.db` with three months of synthetic answers and planted stories, so every insight card and most alarm types have real data. See [engine-integration.md](engine-integration.md), "Demo data".
- **Question bank:** `packages/engine/fixtures/question-bank.json` holds 163 English sample questions in every type, loadable with `loadQuestionBank(db)`.
- **Simulator:** `packages/engine/sim/` checks the engine against known ground truth.
- **Engine speed:** segment statistics are now cached per collective per day, so batch requests no longer scan every person.

Action items:
- [x] Jan: build the demo DB once and check every HR page with `DB_PATH=data/demo.db`. The cards and alarms listed in "Demo data" should all appear. (done 2026-11-07, d154995)
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
- [x] Jan: start the scheduler once in `apps/web/instrumentation.ts`, as in engine-integration.md, with the app's shared DB connection. (done 2026-11-07, fb4293b)
- [x] Jan: HR pages read insights and alarms only through `listInsights`, `listAlarms` and `alarmCounts`, with the viewer taken from the session. Status buttons call `setAlarmStatus` from an HR-only route. (done 2026-11-07, d154995)
- [x] Jan: header badge from `alarmCounts` (poll every ~60 s or refresh on page load). (done 2026-11-07, d154995)
- [x] Jan (optional): a "Recalculate now" button calling `scheduler.runNow()` from an HR-only route. (done 2026-11-07, d154995)

## C4 · 2026-11-07 · Natan · Engine job writes insights and alarms

`runEngineJob` now also calls `runInsights` and `runAlarms`, so one job run fills `agregat`, `domain_importance`, `insight` and `senyal`. `JobReport.insights` and `JobReport.alarms` are objects with counts instead of `"pending"`. No schema change.

What the dashboard reads:
- **`insight`:** kinds `domain_state`, `top_mover`, `polarisation`, `importance_gap`, `trajectory_mix`, `followup_confirmation` and `segment_gap` (`detail_json.dimension` is `"shift"` or `"manager"`). `detail_json` has the labels and previous/current values needed to render a card. Suppressed rows have `value` and `detail_json` NULL.
- **`senyal`:** engine alarm types `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `feble`, `low_confidence` and `improvement`.
  - Each has `severity`, `audience` and `status`.
  - The engine opens alarms and auto-resolves `open` ones. It never touches `acknowledged` or `action_linked` alarms: those statuses are set by HR actions.
  - Lideratge alarms always have `audience = 'hr'`.

Action items:
- [x] Jan: show the insight cards on the HR results page, reading `insight` through `@damm/db/hr`. (done 2026-11-07, d154995)
- [x] Jan: the signals page lists engine alarms with severity and lets HR move them to `acknowledged`, `action_linked` or `resolved`. (done 2026-11-07, d154995)
- [x] Jan: managers see only `audience = 'hr_manager'` alarms for their own collective. (done 2026-11-07, d154995)

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
- [x] Jan: after merging, run `pnpm install` so `pnpm-lock.yaml` picks up `@damm/engine` (its devDependencies are `typescript` and `@types/node`). (done 2026-11-07, fb4293b)
- [x] Jan: add `"@damm/engine": "workspace:*"` to `apps/web` dependencies, and to `transpilePackages` in the Next config if the other workspace packages are listed there. (done 2026-11-07, fb4293b)
- [x] Jan: the C2 items for routing `pool/next`, `responses` and the job through the engine are now unblocked. (done 2026-11-07, fb4293b)

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
- [x] Jan: once `@damm/engine` is on main, route `GET /api/pool/next` and `POST /api/responses` through `createEngine({ db, redact })` (engine-integration.md), and drop the selection and validation logic in `employee-repository.ts`. (done 2026-11-07, fb4293b)
- [x] Jan: stop writing `agregat` in `packages/db/src/init.ts` and call `runEngineJob(db)` after seeding instead. (done 2026-11-07, fb4293b)
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
