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

## 2026-11-08: `TrendCell.confidence` for chart metric panels (Jan)

`@damm/db/hr`: `TrendCell` gains `confidence: number | null` (0-100 from `agregat.confidence`, null when suppressed). `getTrends` and `getShiftTrend` fill it. `TrendChart` uses it, with `consensus`, for its optional Consensus and Confidence panels; a polarisation alarm opens the consensus panel by default and a low-confidence alarm opens the confidence panel. No schema change.

Action items:
- [x] Jan: repository field, chart panels and toggles, alarm defaults, copy. (done 2026-11-08)

## 2026-11-08: HR alarm push, `hr_push_subscription` (Jan)

HR browsers can subscribe to web push on `/hr/settings`. When the analysis job (`POST /api/jobs/run`) creates new open warning or critical alarms for HR, every subscribed HR browser gets one notification in its saved language, linking to `/hr/signals`.

- `schema.sql`: new table `hr_push_subscription` (`id`, `endpoint` UNIQUE, `p256dh`, `auth`, `lang` ca/es/en, `created_at`). No link to `compte`: it holds HR browsers only. Existing databases get it on first connection from `ensureHrPushTable` in `packages/db/src/connection.ts`.
- `@damm/db/hr`: `saveHrPushSubscription`, `deleteHrPushSubscription`, `listHrPushSubscriptions`, `hasHrPushSubscription`, `maxAlarmId`, `listNewAlarms`.
- `POST /api/jobs/run`: the JSON gains `alarmPush` (`off`, `none`, `sent` with alarm and browser counts, or `error`).

Action items:
- [x] Jan: schema, migration, repository, sender, job trigger, settings toggle, copy. (done 2026-11-08)

## 2026-11-08: query question count and delivery mode (Jan)

The HR "New query" form no longer asks for a time budget. It asks for the **number of questions per person** (2 to 6, default 3) and a **delivery mode**: `daily` (the query's questions join the normal daily set, as before) or `campaign` (a one-off extra set: everyone in the target collective gets a push on publish and answers ALL the query's questions on top of the 3 daily ones).

- `schema.sql`: `necessitat.question_count INTEGER` (NULL on old rows) and `necessitat.delivery TEXT NOT NULL DEFAULT 'daily' CHECK (delivery IN ('daily','campaign'))`. Existing databases get both columns on first connection from `ensureQueryDeliveryColumns` in `packages/db/src/connection.ts` (`ALTER TABLE ADD COLUMN`, idempotent). `durada_max_s` stays (follow-ups still set it).
- `@damm/shared`: `QueryDelivery`, `QUESTION_COUNT_OPTIONS`, `DEFAULT_QUESTION_COUNT`; `Necessitat` gains `questionCount` and `delivery`; `PoolNextResponse` gains `campaign: PoolCampaign | null` (`needId`, `title`, `intro`, `preguntes`). `AssignmentReason` is unchanged: campaign answers have no assignment rows.
- `GET /api/pool/next`: `preguntes` is the daily batch and never holds campaign questions; `campaign` is the pending set (null when none).
- `POST /api/responses`: also accepts answers to the questions of a published campaign query for the person's collective, once each.
- `@damm/ai`: `NeedInput.questionCount` (exact count); `maxSeconds` stays optional.

Action items:
- [x] Jan: schema, migration, types, repository, engine, API, HR form, employee PWA, push, copy, docs. (done 2026-11-08)

## 2026-11-08: `dismissed` alarm status (Jan)

`senyal.status` accepts `dismissed`: HR judged the alarm not worth acting on. It is final, like `resolved`, and is not an active status, so the engine can open a new alarm for the same type, segment and domain after the 7-day cooldown. Allowed moves: `open`, `acknowledged` and `action_linked` can go to `dismissed`; nothing leaves it.

- `schema.sql`: the status CHECK includes `dismissed`. Existing databases are migrated on first connection by `ensureDismissedStatus` in `packages/db/src/connection.ts` (table rebuild, idempotent).
- `@damm/shared` and `@damm/engine`: `AlarmStatus` includes `"dismissed"`; `ALARM_TRANSITIONS` as above. `DEFAULT_ALARM_STATUSES` is unchanged, so dismissed alarms are not listed or counted unless asked for.
- HR: new "Dismissed" tab on `/hr/signals`; the row menu has "Mark as reviewed", "Resolve" and "Dismiss" (before, "Dismiss" set `acknowledged`).

Action items:
- [x] Jan: schema, migration, types, transitions, HR tab and actions. (done 2026-11-08)

## C23 · 2026-11-08 · Jan · Daily batch: exactly the cap, one answer type, no free text (supersedes C15 and C18)

`getDailyBatch` (`@damm/engine`) no longer appends published-need questions past the cap. A day is exactly `questionsPerDay` (3) items, all of one answer type. The type is decided first: the top published need's type, else a due follow-up's type, else Thompson sampling over the types that can fill the day; the rest is filled with same-type monitoring items by domain priority. A day is shorter than 3 only when no more items of that type exist; types are never mixed. Needs keep top priority, inside the 3 slots (`maxNeedsPerDay` still 1). `open` questions are never batch items (`BATCH_EXCLUDED_TYPES`): open HR need questions are skipped in the batch (not converted). Commenting is an optional extra on any answered question: `POST /api/responses` already accepts `comentari` with `valorNum`, stored redacted in `resposta.comentari`, and the answer UI now offers it under non-text questions. `missing_comment` still applies to a legacy `open` row. `store.publishedNeedsMissing` is removed. `GET /api/pool/next` text falls back to the user's language, then Catalan, then the stored text. No schema or API shape change.

- [x] Jan: pool route comment, optional comment field in the answer UI, docs. (done 2026-11-08)
- [ ] Natan: nothing to apply; C15 and C18 top-up behaviour is withdrawn. Keep the health check "daily batches within limits" strict.

---

## C22 · 2026-11-08 · Jan · Data retention constants and purge (R-PRIV-8)

`packages/shared` gains `RETENTION` (`rawResponseMonths: 24`, `inactiveAccountMonths: 24`, `pushSubscriptionMonths: 12`). `@damm/db` gains `purgeExpired(db, { dryRun })` (`packages/db/src/retention.ts`): deletes `resposta` rows with `periode` older than the window plus their `comentari_tema` and `resposta_seed` rows, accounts with no recent answer (their `assignment` and `person_domain_state` rows cascade), and old push subscriptions. Aggregate tables (`agregat`, `tema`, `senyal`, `insight`, `recomanacio`, `domain_importance`) are never touched. `POST /api/jobs/run` calls it as its last step (`?dryRun=1` only counts); also `pnpm --filter @damm/db run purge [-- --dry-run]`. No schema change.

- [ ] Natan: confirm the engine tolerates `resposta` rows disappearing for old periods (`runEngineJob` only rewrites `agregat` for periods that still have rows, so older aggregates survive; `comments.ts` does `DELETE FROM tema` and rebuilds, so check that old-period themes are not lost once their comments are purged), and tell Jan if a window should be longer.
- [ ] Jan: add the purge to the Railway scheduled job once the windows are agreed.

---

## C21 · 2026-11-07 · Jan · Join code lookup ignores accents; DEMO-FÀB becomes DEMO-FAB

`lookupJoinCode` (`@damm/db/join`) matches on a key without diacritics, hyphens, spaces and case, and now returns the stored `codi`; `registerAccount` resolves the code through it. No schema change. The deployed DB renames `DEMO-FÀB` to `DEMO-FAB` at startup (`scripts/fix-join-codes.mjs`, idempotent). `packages/engine/demo/build-demo.ts` still derives `DEMO-<first 3 letters>` from the collective name, so a fresh demo DB has `DEMO-FÀB` until the generator strips diacritics.

- [ ] Natan: in `packages/engine/demo/build-demo.ts` strip diacritics from the generated code (`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`) so it yields `DEMO-FAB`.
- [x] Jan: lookup, startup rename and docs (done 2026-11-07).

---

## C20 · 2026-11-08 · Natan · HR dashboard: date window and collective filter

- New read-only HR repository functions in `@damm/db/hr`: `getWindowTrends` (same shape and suppression as `getTrends`, for an arbitrary date window and optional collective, read from the analytics view), `getDataBounds`, `populationOf`. No schema change.
- `/hr` is now the dashboard ("Panell") with interval and collective dropdowns and an "Actualitza" button (`refreshDashboardAction`: runs the engine job and, with `LLM_API_KEY`, the narrative). The sidebar is now Panell, Banc de preguntes, Alarmes, Consultes; Enllaços i QR, Cervell, Com es calcula? and Vista de responsables are at the bottom. "Necessitats" is renamed "Consultes" in the UI only; routes are unchanged.

Action items:
- [x] Jan: FYI only. If you rework the HR sidebar or `/hr`, keep these entries and the filter dropdowns. (done 2026-11-08, merge of origin/main into jan/dev)

---

## C19 · 2026-11-07 · Natan · Brain tab: engine parameters, signals and what-if simulator

- New HR-side engine API in `@damm/engine/hr`: `getBrain` (every config value with its default, HR weights and format preferences with their source, per-collective domain statistics and priorities, format arms per shift, active probes), `simulateBrain` (plays hypothetical people with no history over up to 28 days against the real question bank; config, weights, format preferences and probe boosts can be overridden for the run, nothing is stored), `resetConfig`, `clearDomainWeight`, `clearFormatPreference`, `describeConfig`, `parseConfigPatch`.
- Statistics are hidden for a collective with fewer accounts than the minimum group size; the simulator then uses neutral signals. No account is read or returned.
- The per-collective domain statistics moved from `engine.ts` to `signals.ts` so the live batch and the brain view share them. Behaviour is the same.
- New page `/hr/brain` ("Cervell", sidebar footer) with server actions in `apps/web/app/hr/brain/actions.ts`. It writes only through the existing HR setters (`setConfig`, `setDomainWeight`, `setFormatPreference`). No schema or API change for the employee side.

Action items:
- [x] Jan: FYI only. If you rework the HR sidebar, keep the `/hr/brain` link. (done 2026-11-08, merge of origin/main into jan/dev)

---

## C18 · 2026-11-07 · Natan · The engine tops up published needs itself

- `getDailyBatch` (`@damm/engine`) now always appends the unanswered questions of `publicada` needs for the account's collective to the day's batch, past `questionsPerDay` and `maxNeedsPerDay`, in slots after the existing ones. It runs on every call, so a need published later shows up the same day.
- `approvedQuestionsFor` serves need questions only while their `necessitat` is `publicada`. Nothing else changes; the API and schema are the same.
- The web top-up is now redundant but harmless (`addPublishedNeedsToDay` skips rows already in the batch).

Action items:
- [x] Jan: remove `addPublishedNeedsToDay` (`@damm/db/employee`) and `getTodaysBatch` (`apps/web/lib/engine.ts`) and call `getEngine().getDailyBatch` directly in `GET /api/pool/next`. (done 2026-11-08, merge of origin/main into jan/dev)

## C17 · 2026-11-07 · Jan · NeedCard carries dates, per-question answer counts and participation

`NeedCard` (`@damm/db/hr`, read-only HR type) gains `publicat`, `responses`, `population`, `publications[].creat` and `approved[].answers`. Counts come from `v_resposta_analitica` and are `null` under the minimum group size. No schema change.

- [x] Jan: the Necessitats page shows them (done 2026-11-07, 4bc0db3).
- [x] Natan: nothing to do.

## C16 · 2026-11-07 · Jan · HR respondent counts fall back to per-domain aggregates

- `@damm/db/hr` `getRepresentativeness()` and `getHrOverview()` no longer require `agregat` rows with `domini_id IS NULL`. They use those rows when present and otherwise the largest per-domain `n` of each (collective, shift) as a lower bound of distinct respondents (`segmentCounts` in `hr-repository.ts`).
- Why: `packages/engine/src/job.ts` writes per-domain rows only, so on an engine-built DB Inici showed "—" for participation and every segment showed "Suprimit · Menys de 10 persones han respost" even with n=80 (`docs/hr-ui-audit.md` HR-X-1, HR-ENG-1). No schema change.

Action items:
- [x] Jan: HR side fallback (done 2026-11-07).
- [ ] Natan: in `snapshot` of `job.ts`, emit per (collective, shift) and company-level rows with `domini_id = NULL` and `n` = distinct respondents across domains (the `respondents` sets and `count()` already exist). Then the fallback is no longer used and `n` is exact.

---

## C15 · 2026-11-07 · Jan · Published needs are added to today's batch past the cap

- New in `@damm/db/employee`: `addPublishedNeedsToDay(compteId, day)`. For an account whose batch for `day` already exists, it appends every approved, non-follow-up question of a `publicada` need for the account's collective (or all collectives) that the account never answered and that is not in today's batch, as extra `assignment` rows (`reason='need'`, slots after the engine's). `apps/web/lib/engine.ts` `getTodaysBatch` calls it after `getDailyBatch`; `GET /api/pool/next` uses `getTodaysBatch`.
- Why: Jan wants an employee who logs in or taps the push after a publish to see that need's questions at once. The engine freezes the day's batch on the first request and caps needs at `maxNeedsPerDay` (1) and the day at `questionsPerDay` (3), so a need published later only showed up tomorrow, one question a day.
- No schema change. This is a second writer of the engine-owned `assignment` table, from the web layer.

Action items:
- [x] Natan: in `approvedQuestionsFor` / `selectBatch`, serve need questions only when their `necessitat` is `publicada` (done 2026-11-07, uncommitted: `store.approvedQuestionsFor` filters on `necessitat.estat`).
- [x] Natan: in `getDailyBatch`, top up an existing day's batch with unanswered questions of `publicada` needs, past `questionsPerDay` and `maxNeedsPerDay` (done 2026-11-07, uncommitted: `store.publishedNeedsMissing`, called from `getDailyBatch`; see C18 for Jan).

## C14 · 2026-11-07 · Jan · Publishing a need sends web push, no per-need join code

- `publishNecessitat(necessitatId)` in `@damm/db/hr` no longer takes a base URL, no longer creates `joincode` or `publicacio` rows, and returns `boolean` (false when the need is not `oberta` or has no approved question). Join codes stay per collective for onboarding (`/hr/publish`).
- New in `@damm/db/employee`: `savePushSubscription`, `hasPushSubscription`, `listPushTargetsForNecessitat` (endpoints and keys for the need's collective, or all), `deletePushSubscriptionByEndpoint`. HR code never imports them; it calls `notifyNeedPublished(id)` in `apps/web/lib/push.ts` and gets an aggregate device count only.
- No schema change. The engine still serves every `aprovada` question whatever the need's state.

Action items:
- [x] Natan: none required; FYI if the engine or seed ever relied on a `publicacio` row per need (done 2026-11-07, nothing to change).

---

## C13 · 2026-11-07 · Natan · Listen again: context events, `aprovada_el`, `action_effect`

The deck's cycle ends with "tornar a escoltar". HR is not forced to carry out a recommendation, so there is **no "done" state**: the before/after is anchored on when HR adopted (approved) a recommendation, or on a context event HR records, and always worded "since X", never as proof of cause. Design: [engine.md](engine.md) section 6.

All changes are additive:
- **`recomanacio`:** new column `aprovada_el` (datetime). `approveRecommendation` in `packages/db/src/hr-repository.ts` now sets it. Any other code that approves a recommendation must set it too. Approved rows without it fall back to the first day of their alarm's period. Existing databases need `ALTER TABLE recomanacio ADD COLUMN aprovada_el TEXT` (or re-run init / the demo).
- **New table `context_event`:** `event_date` (YYYY-MM-DD), optional `collectiu_id`, `torn_id`, `domini_id`, `label`, `created_at`. HR functions `addContextEvent` and `listContextEvents` in `@damm/db/hr`. Only events with a domain produce an insight.
- **`insight` kind `action_effect`** (already allowed by the CHECK) is now written by the engine: segment × domain score, confidence and n before vs. after the anchor, `detail.wording` ("Des de <data>, ...") and `detail.limits`. n ≥ 10 in both windows, otherwise suppressed. Rows appear 14 days after the anchor.
- **`improvement` alarm** now uses the same anchors instead of the `action_linked` status; it no longer reads that status.

Action items:
- [x] Jan: show `action_effect` insights and context events on the signal timeline (R-DIFF-6, R-FLOW-8e): "des de <data>" with `detail.wording` and `detail.limits` together, never worded as proof the action worked. No "done" button. (done 2026-11-07, 51458d3)
- [x] Jan: add a small form on the HR side to record a context event with `addContextEvent` (date, label, optional collective, shift and domain) and list them with `listContextEvents`. (done 2026-11-07, 51458d3)
- [x] Jan: if anything else approves a recommendation, set `aprovada_el` there too. (done 2026-11-07, 51458d3)

---

## C12 · 2026-11-07 · Natan · "Indagar" probe (time-boxed extra sampling)

New table `probe` in `packages/db/schema.sql` (additive; rebuild existing databases with `pnpm --filter @damm/db run init` or the demo builder). New in `@damm/engine/hr`: `startProbe`, `listProbes`, `stopProbe` and the types `ProbeView`, `ProbeProgress`. A probe makes the scheduler ask one domain more often for one segment (collective, optionally one shift) for a number of days, optionally tied to an alarm (`senyalId`). It targets segments, never accounts; segments under 10 people are refused with a `ProbeError`. The engine job refreshes each probe's progress (extra answers, confidence before and now) from aggregates, hidden when fewer than 10 people answered. Details: [engine.md](engine.md), "Probes", and [engine-integration.md](engine-integration.md), "Probes (Indagar)".

Action items:
- [x] Jan: rebuild existing databases (new `probe` table). (done 2026-11-07, 51458d3)
- [x] Jan: on the signal page, next to the recommendations, add an "Indagar" button. HR-only route that calls `startProbe(db, { senyalId, collectiuId, tornId, dominiId, boost, days })` with the alarm's segment and domain (defaults `boost = 2`, `days = 14`). Show `ProbeError.message` if it refuses. (done 2026-11-07, 51458d3)
- [x] Jan: while a probe exists for the signal (`listProbes(db, { senyalId })`), show its status, days left, extra answers, confidence before and now, and a "Stop" button (`stopProbe`). Show "not enough answers yet" when `progress` is null or `progress.suppressed`. (done 2026-11-07, 51458d3)

## C11 · 2026-11-07 · Natan · Recommendation proposals for open alarms

Additive schema change on `recomanacio`: `titol`, `iniciativa` (Damm initiative), `responsable_suggerit`, `termini_suggerit`, `justificacio` (cites n and confidence), `limits` ("correlació, no causa"), `font` (`llm` | `template`). `text` holds the concrete action. Rows are inserted as `estat = 'proposada'`, linked by `senyal_id`, by `runRecommendations` (`@damm/engine/job`, run with `draftRecommendations` from `@damm/ai`). Owner and timeframe are suggestions only. There is deliberately **no done/completed column**: HR only approves or discards. Old databases need the seven columns added (or a re-init).
- [x] Jan: show these fields on the signal page (title, action, initiative, suggested owner and timeframe, justification, limits, source). Keep approve/discard only, with no "done" tick. (done 2026-11-07, 51458d3)
- [x] Jan: call `runRecommendations` where the job runs (see engine-integration.md, "Recommendations"), never in a request. `createDraftedFollowUp` stays as is. (done 2026-11-07, 362f275: `POST /api/jobs/run` and the seed.)

## C10 · 2026-11-07 · Natan · Comment analysis: themes, summaries, emergent alarm

Design: [engine.md](engine.md) section 12. `runCommentAnalysis` fills `tema` and `comentari_tema` from the redacted comments (no LLM key needed) and opens `emergent` alarms in `senyal` (`warning`, audience `hr`). It replaces the seeded `tema` rows.

- **`tema`:** new columns `collectiu_id` (NULL = company-wide), `clau` (stable theme key), `share` (0..1, NULL when suppressed) and `font` (`seed` | `rules` | `llm`). Rows are now per theme x period x collective, so a theme appears once per collective. Existing databases get the columns from `ensureThemeColumns` (called by the analysis); fresh ones from `schema.sql`.
- **`comentari_tema`:** written only for shown (`suprimit = 0`), non-sensitive, per-collective rows. A comment can have up to three themes.
- **`senyal`:** `emergent` rows have `domini_id` set and a description starting with the theme label. A seeded placeholder for the same collective and theme is adopted, not duplicated.
- **Entry points:** `runCommentAnalysisSync` / `runCommentAnalysis` from `@damm/engine/job`; script `pnpm --filter @damm/engine run comments`; `scripts/job.ts` and the demo build call it. `runEngineJob` is unchanged.

Action items:
- [ ] Jan: show `tema.resum` and `emergent` on the HR results and signals pages, filtered by collective (`tema.collectiu_id`; the company row, `collectiu_id IS NULL`, for "all"), and show only "not enough data" for `suprimit = 1`. `listThemes` in `hr-repository.ts` currently lists every row without the collective. (`listThemes({ collectiuId })` now filters, default = company row, and returns `collectiuId`, `share`, `font`; the manager page uses it, the HR pages still need to pass the collective: not ticked, 2026-11-07, 362f275.)
- [x] Jan: stop relying on the seeded `tema` rows (`init.ts`, `dashboard-fixtures.ts`): call `runCommentAnalysisSync(db, { now })` after `runEngineJob` in `POST /api/jobs/run` and after seeding, and let the `emergent` alarm come from there instead of the hand-written `senyal` row. (done 2026-11-07, 362f275: `dashboard-fixtures.ts` deleted, placeholders removed from `init.ts`, the seed runs the analysis, `/api/jobs/run` is new.)
- [ ] Jan (optional): a "limits of the analysis" note on the themes view, from the list in engine.md section 12.

---

## C9 · 2026-11-07 · Natan · `baixa_participacio` alarm is now emitted

No schema or API change. `runAlarms` now writes `senyal` rows with `tipus = 'baixa_participacio'`:
- one per collective × shift (collective alone where it has no shifts), `domini_id` NULL, severity `warning`, audience `hr`;
- triggers when the response rate (distinct respondents in the period over the synthetic population) is under 40%, or the segment's share of respondents is under 0.7 × its population share; clears at 45% and 0.8;
- `descripcio` is a Catalan sentence, e.g. "Participació baixa al torn de nit de Fàbriques: 22% (n=18 de 82). ...", and `n` is the respondent count;
- segments with a population or respondents under 10 are suppressed like every other alarm type.
The demo builder now uses `participationScale` 1.6 so only the thin shifts trigger it.

Action items:
- [ ] Jan: show `baixa_participacio` alarms as an explicit representativeness warning banner on results/need pages (R-SC-A5, R-SC-B3)

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
- **Demo database:** `pnpm --filter @damm/engine run demo` builds `data/demo.db` with synthetic answers (now 1 Aug to 7 Nov 2026) and planted stories, so every insight card and most alarm types have real data. See [engine-integration.md](engine-integration.md), "Demo data".
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

## 2026-11-07: `TrendCell` gains `consensus` and `sd` (Jan)

`getTrends()` in `packages/db/src/hr-repository.ts` (and so `getSignalDetail().trend[].cells`) now returns two more fields per cell:

- `consensus`: `agregat.consensus` (0-100, engine formula, higher = answers more alike);
- `sd`: population standard deviation of the 1-5 (`scale5`) answers, computed from `v_resposta_analitica` per period, collective and domain (all collectives for "Tots").

Both are `null` whenever the cell is suppressed (primary or complementary) or n is under the minimum group size. The HR trend chart draws a mean ± 1 SD band and shows both in the tooltip and tables. The signal detail page now plots the signal's own segment: `SignalHeader` gains `tornId`, `SignalDetail` gains `trendScope` (for example "Fàbriques · matí"), and `getShiftTrend(collectiuId, tornId)` in `hr-repository.ts` builds the per-shift series (same suppression, complementary suppression across the collective's shifts, SD from the analytics view filtered on shift). `TrendChart` takes `scale` (`"1-5"` default, `"0-10"` on the signal page). No schema change, `packages/engine` untouched.

Action items:
- [x] Jan: trend chart, signal table and results table show SD and consensus; signal page plots its own segment on 0-10. (done 2026-11-07)
- [x] Natan: aware: `TrendCell` gains `consensus` and `sd` (done 2026-11-07, FYI only).

## 2026-11-07: HR reads the latest readable period; daily limit on publish (Jan)

The first live answer in a new month creates a period with n under 10. The engine job then evaluates only that newest period, so `runAlarms` suppresses every open alarm (`suprimit=1`) and `latestInsightPeriod` points at an empty period; `/hr/results` and `/hr/signals` went blank. Handled HR-side, no schema change, `packages/engine` untouched:

- `@damm/db/hr`: `readingPeriod()` (latest company-wide period with n of at least 10) and `reinstateAlarmsForReadingPeriod()` (un-suppresses open alarms whose segment is readable in that period). The job route and the scheduler's `onReport` call the second one. The CLI job (`packages/engine/scripts/job.ts`) does not, so alarms stay hidden after a CLI run on a thin newest period.
- `hrInsights` defaults to `readingPeriod()`.
- Scoped counts (shift, collective) render as `n≥10` (`nLabel`), so a hidden shift cannot be derived from totals.
- `addPublishedNeedsToDay` (`packages/db/src/employee-repository.ts`) keeps a day within `questions_per_day`: it fills free slots and replaces unanswered `monitor` slots with the published need's questions.

Action items:
- [ ] Natan: make `runAlarms` and `latestInsightPeriod` use the latest period with n of at least 10 (not the newest), and reinstate alarms in the engine job itself, so the HR-side workaround can go and the CLI job behaves the same.
- [x] Jan: HR pages, job route, scheduler and publish use the above. (done 2026-11-07)

## 2026-11-07: Multi-language questions and portals, ca/es/en (N-6) (Jan)

Additive and backward compatible. Catalan stays canonical; a missing translation falls back to Catalan (`text`).

- `pregunta.text_i18n` (new, nullable TEXT): JSON `{"ca","es","en"}`. NULL means "use `text`".
- Options inside `options_json` may carry an optional `i18n: {es:{label}, en:{label}}` (scale anchors, pair, choice, ranking). `ScoredOption` and `RankingOption` in `@damm/shared` gain `i18n?`; `Pregunta` gains `textI18n`.
- `compte.lang` (new, `ca|es|en`, default `ca`): the only language data kept per account. It is never in `v_resposta_analitica`, and push targets expose the language but never the account id.
- `@damm/shared` exports `LANGS`, `Lang`, `pickText`, `negotiateLang`, `parseTranslations`. `getConnection` runs an idempotent `ensureI18nColumns` so existing DBs gain the columns on start.
- `GET /api/pool/next` returns text and option labels already in the account's language. The engine still returns only `text` and `options[].label`; the app merges translations by question id and option index (`getQuestionTranslations`).
- `docs/i18n/question-bank-translations.json`: ca/es/en text and options for the 163 questions of `packages/engine/fixtures/question-bank.json`, keyed by question id. `applyBankTranslations` (called from `apps/web/instrumentation.ts`) backfills rows with NULL `text_i18n` by normalised text, so the engine bank works without touching `packages/engine`.
- `@damm/ai` drafts es/en in a second pass (`translateQuestionTexts`, `withTranslations`); HR edits them in the draft review before approval. `updateDraftText` and `DraftInput` carry them. A failed pass leaves es/en empty and warns HR.
- Not translated (data, not UI): AI/analysis text stored in the DB (theme names, signal titles, recommendation text, need text). Drafted scale anchors are not stored for DB drafts.

Action items:
- [x] Jan: employee PWA, HR portal and manager view dictionaries; language switchers; push per language; draft review with editable es/en. (done 2026-11-07)
- [ ] Natan: adopt `docs/i18n/question-bank-translations.json` in the engine bank (bank loader and `question-bank.json`) and make the bank Catalan-first (it is English today), so the backfill by text can go.
- [ ] Natan: when the engine writes `pregunta` rows, set `text_i18n` and option `i18n` from the bank, and keep `compte.lang` out of anything the engine returns.
- [ ] Natan (optional): translate the engine's insight and alarm texts (`agregat`/`senyal` titles) per language, or store keys instead of sentences.


## 2026-11-08: Approver of a recommendation, one comment snippet per theme (R-X-2, R-X-3) (Jan)

Additive and backward compatible.

- `recomanacio.aprovada_per` (new, nullable TEXT): non-personal label of who approved (what HR types in an optional field, max 60 chars, `@` and control characters stripped, default `HR`). Set together with `aprovada_el` by `approveRecommendation(id, approvedBy?)` in `@damm/db/hr`. `getDb` adds the column to existing databases on start (`ensureApprovalColumn`); `schema.sql` has it for new ones. `SignalRecommendation` gains `aprovadaPer`.
- `getSignalDetail` themes now carry at most 1 verbatim snippet (was 3), and none when the theme has fewer than 10 comments in the signal's scope.
- The HR gate fails closed in production when `HR_ACCESS_CODE` is empty (`/hr`, `/manager`, `POST /api/jobs/run`). Development stays open.

Action items:
- [ ] Natan: if the engine or an analysis job writes `recomanacio` rows or approves them, set `aprovada_per` too (never an email or an account id), and keep it out of anything shipped to the employee side.
- [x] Jan: HR approve forms, recommendation card, signal page, gate. (done 2026-11-08)

## 2026-11-08: scale10 answers are 1..10, no 0 (Jan)

The employee app now shows scale10 questions as 1 to 10 (two rows of 5). It never sends 0 again. Seeded and older answers may still hold 0, so readers must keep accepting it.

- `@damm/shared` `Resposta.valorNum` comment: scale10 is 1..10 (older rows may hold 0).
- The engine still validates 0..10 and scores `v / 10`, so today the lowest answer (1) scores 0.1 instead of 0. Nothing breaks, the floor is just slightly off.

Action items:
- [x] Jan: answer UI, HR type label. (done 2026-11-08)
- [ ] Natan: in `packages/engine` set `SCALES.scale10` to `{ min: 1, max: 10 }` and score scale10 as `(v - 1) / 9` in `normalize.ts` (keep accepting 0 for old rows, clamped to 0), and generate 1..10 in the demo/sim answers.

## 2026-11-08: HR comment browser, `/hr/comments` (Jan)

Additive, no schema or `@damm/shared` change. New HR repository API in `@damm/db/hr` (`packages/db/src/hr-comments.ts`): `getCommentThemes(lang?)` and `searchComments(filters, page, lang?)`. They read only `tema`, `comentari_tema` and `v_resposta_analitica`.

- Counts are comments, not distinct people (the view has no account id). Cells under 10 are hidden, with complementary suppression; themes under 10 are counted, never named. A filter combination under 10 returns no text and no count. Order is a fixed shuffle, so it carries no time signal.
- Theme text goes through one function, `overlayThemeText`. After merging the `traduccio` work, replace its body with `overlayTranslations(db, "tema", rows, { etiqueta: "etiqueta", resum: "resum" }, lang)` from `./hr-i18n`.

Action items:
- [x] Jan: page, nav entry, dictionaries. (done 2026-11-08)
- [x] Jan: after merging `jan/demo-db`, swap the `overlayThemeText` body as above. (done 2026-11-08, merge e50c0b1 and the commit that follows it)

## 2026-11-08: Demo DB build, `traduccio` overlay for generated text (N-6, R-FLOW-5) (Jan)

Additive and backward compatible. Catalan stays canonical in the source column; a missing row falls back to Catalan.

- `traduccio(entitat, entitat_id, camp, lang, text)` (new table, PK on the first four): es/en overrides for generated HR text. Entities: `tema` (etiqueta, resum), `recomanacio` (text, titol, iniciativa, responsable_suggerit, termini_suggerit, justificacio, limits), `necessitat` (text_nl, titol, intro), `senyal` (descripcio). Read through `overlayTranslations` in `packages/db/src/hr-i18n.ts`; the HR repository and the HR/manager pages pass the request language. A DB without the table works (fallback).
- Narrative insights may carry `detail.i18n.{es,en}.{summary,highlights[]}`; `getNarrative(collective, lang)` in `apps/web/app/hr/analytics.ts` applies it.
- Engine hooks, no behaviour change when unused: `buildDemo` options `participation` (per `collectiuId:tornId` account share) and `commentPools` (comment language per account); `sim/world.ts` takes the participation override.
- Engine health check: the "daily batches" check stays strict (at most the daily cap per person per day, needs included, C23). The looser variant from the demo-db branch was dropped.
- `pnpm demo-db` builds the one demo DB (`data/demo.db`): 99 days (1 Aug to 7 Nov 2026), 638 accounts in 4 collectives, 6 domains, every segment n >= 10, nothing suppressed, ca/es/en content. See `AGENTS.md`.

Action items:
- [ ] Natan: review the two engine hooks (`sim/world.ts`, `demo/build-demo.ts`); keep them or move them where you prefer.
- [ ] Natan (optional): when the engine writes themes, recommendations or signal text, also write es/en rows to `traduccio` (or store keys instead of sentences).
- [x] Jan: schema, overlay, HR/manager pages, build script. (done 2026-11-08)

## 2026-11-08: Archive resolved and dismissed alarms, reopen dismissed ones (Jan)

Additive and backward compatible.

- `senyal.archived_at TEXT` (new nullable column, added on boot by `ensureAlarmArchiveColumn`): set when HR archives a resolved or dismissed alarm. Archived alarms leave the Resolved and Dismissed tabs and show under Archived on `/hr/signals`. Status is unchanged.
- `reopenDismissedAlarm(id)` in `@damm/db/hr` sets a dismissed alarm back to `open` and clears `archived_at`. It writes the DB directly; the engine's `ALARM_TRANSITIONS` still has no move out of `dismissed`.

Action items:
- [ ] Natan (optional): if the engine should own reopening, add `dismissed -> open` to `ALARM_TRANSITIONS` and we switch the action to `setAlarmStatus`.
- [x] Jan: column, repository functions, alarms page tabs and buttons. (done 2026-11-08)

## 2026-11-08: Push subscriptions per device, not per account (R-FLOW-4) (Jan)

Backward compatible; old databases are rebuilt on first use by `ensurePushPerDevice` in the employee repository (rows kept).

- `push_subscripcio` is keyed by `endpoint` (one row per device) instead of `compte_id`, with an index on `compte_id`. An account can now get notifications on several devices (phone and laptop); before, the device opened last replaced the other.
- `savePushSubscription` upserts on `endpoint` (a device signed in with another account moves to it). `deletePushSubscription(compteId, endpoint?)` removes one device when given the endpoint (push toggle off), all of the account's devices otherwise (logout).

Action items:
- [x] Jan: schema, migration, repository, settings action and push toggle. (done 2026-11-08)
