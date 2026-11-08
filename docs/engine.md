# Engine spec (`packages/engine`)

Owner: Natan. Status: design, agreed with Natan on 2026-11-07. Not implemented yet.

The engine decides **which questions each person gets each day** and turns answers into **domain scores with confidence and consensus**, **insights** and **alarms**. It is the only component that holds per-account state. Everything it hands to the HR side is an aggregate over at least `MIN_GROUP_SIZE` (10) people.

Naming: existing schema identifiers stay in Catalan (`collectiu`, `pregunta`, `resposta`, ...). Everything new (tables, columns, code, docs) is in English.

## 1. Delivery model

- Each person gets a **daily batch of 3 questions** (`questions_per_day`, configurable), delivered together. No timeouts: they answer whenever they want.
- The batch is fixed for the day once generated (stored in `assignment`), so reloading the app shows the same questions.
- **Current assumption: everyone answers.** Non-response handling (re-prompting, easier formats, adaptive cap) is deliberately out of scope for now. The `assignment` table already records `answered_at`, so it can be added later without schema changes.
- Every question has an optional free-text comment.

## 2. Question types and the common answer space

Every answered closed question becomes one observation `(domain, facet, item, score, noise)` where **`score` ∈ [0, 1] and 1 is always the best outcome**. This is what lets different questions be analysed together.

| `tipus` | UI | Raw value | `score` | Noise σ (default) |
|---|---|---|---|---|
| `scale10` | rate 0–10 | `valor_num` 0..10 | x / 10 | 0.10 |
| `scale5` | Likert or 5 faces | `valor_num` 1..5 | (x − 1) / 4 | 0.12 |
| `yes_no` | yes/no, true/false | `valor_num` 0/1 | 0 or 1 | 0.25 |
| `pair` | this or that (2 statements) | `valor_num` = option index | `options[i].score` | 0.22 |
| `choice` | pick the most representative of 3–5 statements | `valor_num` = option index | `options[i].score` | 0.17 |
| `ranking` | order 3–5 statements | `value_json` = option indices, best first | **no score** (see below) | – |
| `open` | free text only | `comentari` | **no score**, goes to themes | – |

Rules:
- **Polarity.** `pregunta.polarity = -1` for negatively worded items ("I feel overloaded"): `score = 1 − score`. Option scores of `pair`/`choice` are already oriented and ignore polarity.
- **Option scores** (`pregunta.options_json`) are written with the question. When the AI drafts a question it proposes them; HR approves them with the question.
- **Ranking measures importance, not satisfaction.** Each option carries a `domain_id`. Positions become Borda weights (`(k − position) / (k − 1)` for k options, position 1-based, so first = 1 and last = 0) and feed a per-segment **domain importance** used by insights (importance vs. satisfaction) and optionally by HR domain weights. Rankings never enter the domain score.
- **Item bias.** Different wordings have different baselines. Model: `score = level(person, domain) + bias(item) + noise`. `bias(item)` is learned as the shrunk mean residual `Σ(score − level) / (n + k_bias)` over everyone who answered it (`item_stats`), default `k_bias = 20`. The engine always works with the adjusted value `score − bias(item)`. This is a light item-response model.
- The engine computes `score` at insert time (or in the job) and stores it in `resposta.score` so analysis and the dashboard never re-implement the mapping.

## 3. Personal trajectory (per account × domain)

A local-level Kalman filter per account and domain (`person_domain_state`). Never leaves the engine.

- State: `level` ℓ, variance `P`, `last_at`.
- New person: ℓ = current segment mean (or 0.6 if none), `P = 0.04`.
- Time update before each observation: `P += q · days_since_last` (`q = 0.0005`/day), so old knowledge loses weight.
- Observation `y = score − bias(item)`, `R = σ_type²`:
  - surprise `z = (y − ℓ) / sqrt(P + R)`
  - gain `K = P / (P + R)`, `ℓ += K (y − ℓ)`, `P = (1 − K) P`
- **Outlier → follow-up.** If `|z| ≥ followup_z` (2.5) and the answer is not itself a follow-up: store `pending_followup_domain` and the pre-drop level, inflate `P += 0.02` so the filter can move quickly, and schedule a follow-up 3–7 days later (`followup_min_days`, `followup_max_days`): same domain, **same facet, different item**, with a comment prompt ("Has anything changed?").
- **Follow-up result.** If the follow-up's `y` is also ≥ 2 σ away from the pre-drop level in the same direction, the change is **confirmed** (`confirmed_change_at`, `confirmed_change_dir`). Otherwise it was noise and the pending state is cleared.
- Follow-up wording may reference the person's own earlier answer. It is rendered only on that person's device. HR never sees who got a follow-up.

## 4. Segment score, confidence and consensus

Segment = domain × collective (× shift where relevant), and the all-company roll-up. **The unit is the person, not the answer**, so heavy responders and people who received follow-ups do not pull the average.

For each person p in the segment with a state in that domain:
- recency weight `w_p = 0.5 ^ (days_since(last_at_p) / half_life_days)` (`half_life_days = 21`)
- `n_eff = Σ w_p`, `m = Σ w_p ℓ_p / n_eff`, `s² = Σ w_p (ℓ_p − m)² / n_eff`, `P̄ = Σ w_p P_p / n_eff`
- `N` = segment size from the synthetic population (`empleat_sintetic`)

Then:
- `SE² = (1 − n_eff / N) · (s² + P̄ + c) / (n_eff + 1)` with `c = 0.01`
- **score** = `10 · m` (0–10 scale shown on the dashboard)
- **confidence** = `100 · clamp(1 − SE / se_tolerance, 0, 1)` with `se_tolerance = 0.05` (i.e. ±0.5 on the 0–10 scale)
- **consensus** = `100 · clamp(1 − s / 0.5, 0, 1)` (0.5 is the largest possible spread on [0, 1])

Properties: everyone answered → `n_eff = N` → confidence 100. Identical answers → high confidence and consensus 100. Different answers → lower confidence, lower consensus. No new answers → weights decay → confidence falls on its own. A few agreeing people do not give false certainty (`c`, `+1`).

Representativeness: the collective score is computed by shift strata and combined with population weights. A silent stratum keeps a large SE and lowers the collective's confidence.

`n < MIN_GROUP_SIZE` (real respondents, not `n_eff`) → row suppressed, value columns NULL.

## 5. Choosing the daily batch

All six domains stay active. A day is **exactly `questions_per_day` (3) items of one answer type** (C23). The type is decided first: the top HR need's type, else a due follow-up's type, else Thompson sampling over the types that can fill the day. Everything below then only considers items of that type. `open` questions are never batch items; commenting is an optional extra on any answer. Published needs take a slot inside the 3, never on top. A day is shorter only when no more items of the type exist. Per person per day:

1. **Follow-up** (at most 1/day): if a follow-up is due, it takes a slot.
2. **HR needs** (at most 1/day by default): approved items with `necessitat_id` for this collective, highest `prioritat` first.
3. **Monitoring** fills the remaining slots. Domain priority:
   `priority_d = hr_weight(collective, d) · probe_boost_d · (info_gain_d + floor) · outlier_boost_d`
   - `info_gain_d` = drop in the segment's `SE²` from one more answer, normalised across domains. High when the domain is uncertain, low when it is well known.
   - `floor = 0.15`: no domain ever stops being asked.
   - `outlier_boost_d = 1 + 0.5 · clamp(outlier_share_d / 0.0455 − 1, 0, 3)`: the share of recent (14 days) personal `|z| ≥ 2` in that domain, compared with the 4.55 % expected by chance. Only excess outliers boost, so the engine insists where something is really happening.
   - `hr_weight` from `domain_weight` (default 1).
   - `probe_boost_d`: the "Indagar" multiplier while an HR probe is active for this person's segment and domain (default 1). See "Probes" below.
   - Domains are drawn **without replacement with probability ∝ priority** (stochastic, so near-equal domains alternate naturally). No two monitoring questions from the same domain in one batch.
4. **Facet**: within the chosen domain, the facet this person has gone longest without (ties random).
5. **Item and format**: among approved items of that facet for this collective, excluding items this person saw in the last `item_cooldown_days` (28), pick the format by **Thompson sampling** (below), then a random item of that format.

### Format choice by Thompson sampling

For each (collective, shift, format) keep `Beta(α, β)` (`format_stats`). Reward = a *good answer*: answer time ≥ `min_answer_ms` (1500 ms). Answers without `answer_ms` do not update the arm. (Planned: also flag the same raw value across a whole batch.) Per decision, for each eligible format f draw `θ_f ~ Beta(α_f, β_f)` and pick f at random with probability `0.1 + (1 − 0.1·n) · θ_f·pref_f / Σ θ·pref` over the n allowed formats (floor lowered to 1/n when n > 10), where `pref` comes from `format_preference` (HR; 0 = banned, default 1). The weight is a lean, not a ranking: 3 vs 1 shows the first format about three times as often, and every allowed format keeps at least a 10% share.

Example: HR sets Fàbriques to yes_no 3, scale5 2, pair 1, ranking 0. The engine never shows rankings in Fàbriques and leans to yes/no, but if night shift turns out to answer `scale5` carefully and rush through yes/no, the Beta for yes_no drops and `scale5` wins more often. Formats with little data have wide Betas and still get tried.

When non-response is modelled later, the same Thompson step gets an "answered" reward. Nothing else changes.

### Probes ("Indagar")

HR can ask the engine to dig deeper into an alarm: sample one domain more in one segment for a while, to get more feedback before deciding.

- **What:** a row in `probe`: collective, optional shift, domain, `boost` (1 < boost ≤ 10, default 2), `starts_at`, `ends_at` (`days`, default 14, at most 90), optional `senyal_id`. API in `@damm/engine/hr`: `startProbe`, `listProbes`, `stopProbe`.
- **Effect:** while `starts_at ≤ now < ends_at` and the probe is not stopped, `probe_boost_d` multiplies the domain's priority for accounts in the segment (collective, and shift if the probe names one). Other collectives, other shifts, and any time outside the window are untouched. Several probes on the same domain take the largest boost. Because domains are drawn ∝ priority, a boost raises the chance the domain is asked on a given day; it does not add slots.
- **Rules that still hold:** at most `questions_per_day` questions (a probe never adds slots), one monitoring item per domain per day, a due follow-up first, HR needs next, formats at weight 0 stay banned, and the item cooldown applies. Within the probed domain the facet the person has gone longest without comes first, so extra asks widen facet coverage instead of repeating an item.
- **Open comment prompt:** in a probed domain the format step multiplies the preference for `open` items by 2, so people get the chance to say why. If the facet has no `open` item, the normal format choice applies.
- **Refusals:** the segment (synthetic population, else accounts) must have at least `min_group_size` (10) people; a second active probe on the same segment and domain is refused; boost and days are range-checked. A probe addresses segments only: nothing in it names or selects an account, and the scheduler's per-account decision is the same function as before.
- **Progress:** the engine job fills the progress columns on every run from answers since the probe started, never per person. `extraAnswers = answers − answersBefore`, where `answersBefore` counts an equally long window before the start. `confidenceBefore` is the segment's `agregat` confidence when the probe started, `confidenceNow` the latest. If fewer than 10 different people answered during the probe, `suprimit = 1` and every number is hidden. Progress freezes when the probe ends or is stopped.


### Campaign queries (delivery = campaign)

A query has `question_count` (2-6) and a `delivery` mode. `daily` queries feed the batch as described above. `campaign` queries are a one-off extra set and never enter the daily batch (excluded in the SQL of `approvedQuestionsFor` and again by `QuestionDef.campaign` in `selectBatch`).

- `engine.getCampaign(accountId)` returns the oldest pending campaign for the person's collective (published, not closed, not yet answered by this person), with all its questions, which may mix types. Pending is derived from the absence of `resposta` rows, so there are no assignment rows and `AssignmentReason` is unchanged.
- `submitAnswers` accepts each campaign question once (a repeat is `already_answered`) and returns `remainingCampaign` next to `remainingToday`. Campaign answers still feed `learn`.
- The set stays available until answered or HR closes the query. Databases without the `delivery` column behave as all-daily.

## 6. Insights (periodic, dashboard)

All per segment with n ≥ 10. Written to `insight` with `kind`:

| `kind` | What |
|---|---|
| `domain_state` | score, confidence, consensus per domain × segment, with change vs. previous period |
| `top_mover` | largest changes since last period where confidence ≥ `insight_min_confidence` (60) |
| `polarisation` | consensus fell ≥ 15 points while the score moved < 0.5 |
| `importance_gap` | high importance (rankings) and low score: where to act first |
| `driver` | domain whose change correlates most with Benestar across people in the segment (computed in-engine, only the coefficient is output) |
| `trajectory_mix` | % of people improving / stable / declining per domain (personal filter slope over 30 days) |
| `followup_confirmation` | % of follow-ups that confirmed the drop, per domain × collective |
| `segment_gap` | night vs. day, managers vs. non-managers (manager positivity bias) |
| `action_effect` | "listen again": score before vs. after the day HR adopted (approved) a `recomanacio`, or a context event HR recorded, on its domain. Worded "since X", never as proof of cause |

**Implemented** (`src/insights.ts`, `runInsights(db, { now })`, run after `runEngineJob`): every kind above except `driver`. Each run replaces its own kinds for the periods it covers (idempotent). Rows with n < `minGroupSize` are written suppressed (`value`, `detail_json` NULL). `value` per kind: `domain_state` score; `top_mover` score change (top 5 per period, |change| ≥ 0.3, confidence ≥ `insight_min_confidence` in both periods); `polarisation` consensus drop; `importance_gap` importance × (1 − score/10), with `rank` and `quadrant` in the detail; `trajectory_mix` % declining (detail: improving / stable / declining %, change ≥ 0.5 on 0–10 over 30 days counts as a move); `followup_confirmation` % of resolved follow-ups that confirmed; `segment_gap` highest − lowest shift score (`detail.dimension = "shift"`, `torn_id` = lowest shift) or manager − non-manager score (`detail.dimension = "manager"`). Trajectories, follow-up outcomes and the manager split come from replaying `resposta` (follow-ups = `assignment.reason = 'followup'` or a follow-up-worded item), since `person_domain_state` keeps only the latest state.

**Listen again (`action_effect`, `src/listen-again.ts` and `actionEffectInsights` in `src/insights.ts`).** The deck's cycle ends with "tornar a escoltar". HR is not forced to carry out a recommendation, so there is **no "done" tick anywhere**. The comparison is anchored on:
- the day HR **adopted** a recommendation (`recomanacio.aprovada_el`, set when it is approved), on the segment × domain of the alarm it answers; or
- a **context event** HR recorded (`context_event`: date, optional collective and shift, domain, label; e.g. "new shift system from 1 Oct"). Events without a domain are ignored.

For each anchor the row has the segment × domain **score, confidence and n in the window before vs. after** (`effectWindowDays`, default 30). Before = each person's last level before the anchor, among people who answered in the 30 days before. After = their last level up to anchor + 30 days (or now), among people who answered after the anchor. The change rule is the one of `top_mover`: |Δ| ≥ 0.3 and confidence ≥ `insight_min_confidence` in both windows, giving `change` = `improved` / `declined` / `no_clear_change`, or `low_confidence` when a window is not reliable enough to compare. **Both windows need n ≥ 10**, otherwise the row is suppressed (value and detail NULL). No row until `effectMinAfterDays` (14) have passed since the anchor. The row's `periode` is the current period; the whole kind is replaced on every run. `detail` has `anchor`, `since`, `before`, `after`, `delta`, `change`, `wording` ("Des de <data>, Logística · Condicions i organització: la puntuació ha pujat (5.1 → 6.3, n 38 → 40).") and `limits` (correlation, not cause; seasonality, other changes and who answers also matter). **Show `wording` and `limits` together.** The `improvement` alarm uses the same anchors (no dependence on the `action_linked` status).

## 7. Alarms (`senyal`)

Each alarm has `severity`, `status` (`open` → `acknowledged` → `action_linked` → `resolved`, or `dismissed` from any non-final status), `audience`, a trigger level and a separate clear level (hysteresis), and a cooldown of 7 days per (type, segment, domain). Warnings go in a weekly digest; critical alarms are pushed immediately. The AI may attach a proposed `recomanacio`; a human decides.

| `tipus` | Trigger (defaults) | Severity | Audience |
|---|---|---|---|
| `sharp_drop` | segment score fell ≥ 1.0 (0–10) within 14 days with confidence ≥ 60 | critical | hr_manager |
| `sustained_decline` | negative slope over ≥ 3 consecutive periods | warning | hr_manager |
| `changepoint_cluster` | ≥ 10 people in a segment with a *confirmed* drop in the same domain within 14 days | critical | hr_manager |
| `polarisation` | consensus fell ≥ 15 points | warning | hr |
| `feble` (weak signal) | small but steady shift (≥ 0.3 over 3 periods) with rising confidence | info → warning if it persists | hr |
| `emergent` | new growing comment theme (analysis module) | warning | hr |
| `baixa_participacio` | segment response rate < 40% of its population, or its share of respondents < 0.7 × its population share (clear at ≥ 45% and ≥ 0.8) | warning | hr |
| `low_confidence` | domain confidence < 40 for 14 days | info | hr |
| `improvement` | significant rise since an adopted recommendation or a recorded context event (same anchors as `action_effect`; baseline = the period before the anchor's) | info | hr_manager |

Routing:
- `hr_manager` = HR plus the manager of that collective. Managers see only their own collective and only n ≥ 10. Smaller teams roll up to the next level.
- **Lideratge alarms go to HR only**, never to the manager being assessed.
- Safety or harassment content in comments never becomes an alarm that exposes the comment. The app points the person to the official confidential reporting channel (Ley 2/2023). HR only sees aggregate theme trends.

**Implemented** in `packages/engine/src/alarms.ts` (`runAlarms(db, { now })`, run after `runEngineJob`), all types above; `emergent` is implemented by the comment analysis (section 12). Thresholds live in `ALARM_DEFAULTS` (overridable via `opts.thresholds`). Because `agregat` is per month, "within 14 days" for `sharp_drop` and `polarisation` is read as "vs. the previous period"; `low_confidence` needs two low periods or 14 days into the current one. Clear levels: `sharp_drop` drop < 0.5, `sustained_decline` slope ≥ 0, `changepoint_cluster` < 5 people, `polarisation` fall < 7.5, `feble` fall < 0.15, `low_confidence` ≥ 50, `improvement` rise < 0.25. Cooldown counts from the last alarm's `created_at` (there is no resolved-at column). `changepoint_cluster` is evaluated on non-nesting segments only (collective × shift where the collective has shifts, else the collective) so counts cannot be differenced. Company-wide and Lideratge alarms go to `hr`. Open alarms whose segment falls below n = 10 get `suprimit = 1` until it recovers. `baixa_participacio` compares distinct respondents in the current period (`resposta`, counted inside the engine, never stored per account) with the synthetic population (`empleat_sintetic`), on the same non-nesting segments as `changepoint_cluster`. It has no domain (`domini_id` NULL), a Catalan description such as "Participació baixa al torn de nit de Fàbriques: 22% (n=18 de 82). Pes a la mostra …", and is suppressed (nothing opened, open alarms hidden) when the population or the respondents are under `minGroupSize`. Thresholds: `participationTrigger`/`participationClear`, `shareRatioTrigger`/`shareRatioClear`.

## 8. Configuration

`engine_config` (key → value), defaults:

| key | default |
|---|---|
| `questions_per_day` | 3 |
| `half_life_days` | 21 |
| `se_tolerance` | 0.05 |
| `followup_z` | 2.5 |
| `followup_min_days` / `followup_max_days` | 3 / 7 |
| `item_cooldown_days` | 28 |
| `min_answer_ms` | 1500 |
| `insight_min_confidence` | 60 |
| `domain_floor` | 0.15 |

HR-editable from the dashboard: `domain_weight` (per collective × domain) and `format_preference` (per collective × format).

## 9. Anonymity boundary

- Per-account tables (`assignment`, `person_domain_state`) are engine-side only, like `resposta`. HR code and `@damm/db/hr` must never read them (add them to the anonymity check).
- The engine writes only aggregates (`agregat`, `insight`, `senyal`, `domain_importance`) with n ≥ 10.
- Follow-up decisions are never exposed per person.

## 10. Package layout (planned)

```
packages/engine/src/
  config.ts        load engine_config + defaults
  normalize.ts     raw answer → score (section 2)
  item-bias.ts     item_stats update
  person.ts        Kalman update, outlier + follow-up logic (section 3)
  segment.ts       score / confidence / consensus (section 4)
  thompson.ts      Beta sampling for formats
  batch.ts         daily batch selection (section 5)
  insights.ts      section 6
  alarms.ts        section 7
  job.ts           run everything; called by POST /api/jobs/run and a script
```

All selection and scoring functions are pure (state in, decision out) and take a seeded RNG, so they are unit-testable and reproducible.

## 11. Learning: how the engine trains

The engine has no offline training step that it depends on. It is a set of **Bayesian models that learn online**: every answer updates them immediately and in closed form, in a few microseconds.

| What it learns | From | Where |
|---|---|---|
| each person's level per domain | that person's answers (Kalman filter) | `person_domain_state` |
| each item's wording bias | everyone's answers to that item | `item_stats` |
| which formats get careful answers per collective × shift | answer quality (Beta counts) | `format_stats` |
| segment score, confidence and consensus | person levels, recomputed by the job | `agregat` |

On top of that it can be trained beforehand in three ways, none of which changes the code:

1. **Priors (warm start).** `engine_config.priors` holds what the engine believes before it sees data: the prior level and variance, a per-domain prior level, and per-format Beta priors. These can be fitted on other datasets, for example public workplace surveys such as Eurofound's European Working Conditions Survey, a previous deployment, or the synthetic seed. The engine then starts from those beliefs instead of from flat ones, and real answers override them as they arrive. Strong priors are worth a few dozen answers; weak ones fade after a handful.
2. **Replay (bootstrap).** `runEngineJob` replays all stored `resposta` rows in time order. On a new database it rebuilds `person_domain_state` and `item_stats` from history, so importing old data or seeding gives a trained engine on day one.
3. **Hyperparameter tuning (offline).** `half_life_days`, `process_noise_per_day`, `followup_z`, the noise per type and the shrinkage are tuned by replaying data with known ground truth: the synthetic seed with its hidden biases (`resposta_seed`), or a simulator. The goal is to maximise how fast the planted signals (the October theme, the Logística weak signal, the night-shift gap) are detected while keeping false alarms low. The winning values are stored in `engine_config`, and the job records `engine_version`.

Why this design rather than a big pre-trained model:
- the data volume is small (hundreds of people);
- every number must be explainable to HR and in the demo;
- anonymity rules out pooling individual-level external data;
- and the engine has to adapt to each company and collective from its own answers.

A neural or gradient-boosted model can later replace any single component behind the same interfaces (for example a learned answer-propensity model in the Thompson step) without changing the rest.

## 12. Comment analysis (`comments.ts`)

Guide scenario C: HR has about 500 open comments and needs them grouped, summarised, compared with the previous period and turned into areas for action, with the limits of the analysis stated. `runCommentAnalysisSync(db, { now })` (deterministic) and `runCommentAnalysis(db, { now, classify?, summarise? })` (async, optional LLM) live in `packages/engine/src/comments.ts`; the lexicon is `comments-lexicon.ts`. `runEngineJob` does not call them; the job script (`scripts/job.ts`), the demo build and `pnpm --filter @damm/engine run comments` call them after the job.

**Input.** Redacted comments from `v_resposta_analitica` (no account id), all periods up to now.

**Themes.** A fixed taxonomy of 15 themes (`THEMES`): the 12 general themes of the seed (workload, tiredness and rest, relation with the direct manager, direction and vision, training, career and promotion, recognition, internal communication, team atmosphere, collaboration between departments, tools and systems, work-life balance and schedules), the *shift system and breaks* theme, *heat and protective equipment (EPI)*, and one sensitive theme (harassment, accidents). Each has a `key` (the same ids as the seed's hidden labels), a Catalan label and a domain.

**Deterministic classifier.** Text is normalised (lowercase, no accents, no punctuation) and matched against a lexicon of stems, exact words and phrases in Catalan, Spanish and English. Evidence is weighted (strong entries count 2, shift and break words 3); stems of 8+ letters tolerate one typo. A comment gets every theme whose evidence is more than half of the best one's, at most three (`comentari_tema.confianca = score / (score + 1.5)`). Ties go to the more specific theme.

**Rows.** One `tema` row per theme x period x collective, plus one company-wide row (`collectiu_id` NULL): `n` (comments), `share` (n / comments of that collective in that period), `resum`, `emergent`, `suprimit`, `font` (`rules` or `llm`), `clau`. A row is suppressed (`suprimit = 1`, `share` and `resum` NULL, no `comentari_tema` links) when `n < 10` or the collective has fewer than 10 comments that period. `comentari_tema` links are written only for shown, non-sensitive, per-collective rows, because the HR drill-down reads comments through them.

**Summaries.** Template-based by default, in Catalan: count, share, change in points against the previous period, themes that co-occur. Built from counts only; it never quotes a comment. If an LLM `summarise` is injected it receives up to eight redacted comments of the group (never sensitive ones) and is told not to quote; the answer is discarded when it copies a run of five words from any of them, and the template is used. At most 40 summaries per run go to the LLM (emergent and latest period first).

**Emerging themes.** Compared with the previous period, per collective: the theme's share rose by at least 10 points (`emergentTrigger`), the theme has at least 10 comments now, and both collective-periods have at least 10 comments. The previous *theme* count may be small (that is what emerging means). This sets `tema.emergent` and opens an `emergent` alarm in `senyal` for the latest period: severity `warning`, audience `hr`, domain of the theme, wording from counts only. Clear level: the rise falls below 5 points. Hysteresis, a 7-day cooldown and "a human-owned alarm is never touched" work as in section 7. An open alarm resolves when its theme drops below 10 comments, and is hidden (`suprimit`) when the collective falls below 10 comments. A seeded placeholder `emergent` row for the same collective and theme is adopted (text and numbers replaced), not duplicated.

**Safety and harassment (section 7).** Sensitive comments are counted in aggregate only: a fixed summary text, no `comentari_tema` links (so HR drill-downs cannot show them), no alarm, no LLM summary.

**Optional LLM** (`packages/ai/src/comments.ts`): `classifyCommentsLlm` assigns theme keys in batches of 40 (local ids, no response or account ids) and `summariseThemeLlm` writes the summary. Both go through `chatJson` and return null without a key or on a bad answer; the engine then keeps the lexicon result for that batch and the template for that summary. The LLM is only used in jobs, never in a dashboard request.

### Accuracy

`pnpm --filter @damm/engine run comments:eval` (needs the seeded `data/app.db`) compares the assignments with the hidden label `resposta_seed.tema_real` of the 500 synthetic comments:

| Measure | Value |
|---|---|
| Top-1 accuracy (best theme equals the true theme) | **91.2 %** |
| Recall (true theme is among the assigned themes) | **97.4 %** |
| Precision of all assigned themes (extra themes of a multi-theme comment count as errors) | 84.8 % |
| Coverage (at least one theme) | 100 % |

The weakest themes are conciliation, tiredness and the shift theme (extra assignments next to neighbouring themes, and comments that mention shifts in another context). The first lexicon version scored 72.6 % top-1; one review round of its misses on this data brought it to 91.2 %. **Caveat for the pitch:** the seed comments come from a template bank with a limited set of phrasings and the lexicon was tuned on them, so this figure measures coverage of *these* phrasings, not of free human text. Expect lower accuracy on real comments; the LLM path (`classify`) exists for that and is not part of the figure.

### Limits of the analysis (for the methodology page)

- **Lexicon coverage.** Unknown words, slang and rare phrasings are missed; a comment with no match gets no theme (it still counts in the denominator of the shares). The lexicon covers Catalan, Spanish and English; other languages and code-switching only match the words they share.
- **Irony, negation and tone.** The classifier finds *what* a comment is about, not whether it is positive or negative: "the schedule is great" and "the schedule is awful" land in the same theme. Irony and sarcasm are not detected.
- **Several themes, one comment.** A comment can carry up to three themes; counts and shares are per theme and do not add up to 100 %. Neighbouring themes (communication vs shift system, workload vs tiredness) overlap.
- **Small groups.** Themes with fewer than 10 comments, and collectives with fewer than 10 comments, are hidden, so signals below the threshold are not shown; this is the price of anonymity. Shares are shares of *commenters*, who are not a random sample (people write more when unhappy) and are not weighted to the population.
- **Volume is not importance.** A frequent theme is not necessarily the most relevant one; the emergent alarm looks at change, not size.
- **Correlation, not cause.** A rise in a theme is not evidence of what caused it.
- **Summaries are automatic.** Template summaries describe counts only. LLM summaries are checked against copying but can still be wrong or generic. AI proposes, a human decides.
- **Redaction.** Names and contact details are redacted before storage by a pattern scrubber, which can miss unusual identifiers.

## 13. Recommendation proposals

`packages/engine/src/recommendations.ts`, `runRecommendations(db, { now, draft })`. Runs as a job after `runEngineJob` (alarms must exist), never in a request. The engine stays dependency-free: `draft` is injected, normally `draftRecommendations` from `@damm/ai`.

- For each alarm that is `open`, not suppressed, with `n >= minGroupSize`, and with no `recomanacio` yet, it builds an aggregate-only context (alarm type, severity, domain, collective and shift labels, score, change vs. the previous period, n, confidence, summaries of the `importance_gap`, `segment_gap` and `polarisation` insights of the same segment) and inserts the 1 to 3 returned proposals as `estat = 'proposada'`, linked by `senyal_id`.
- Idempotent: an alarm with any recommendation (even a discarded one) is never redrafted. A failing or empty draft is counted in `failed` and retried on the next run.
- Lideratge alarms stay HR-only: a manager role (Cap de ..., Responsable de ...) is never kept as suggested owner there; it becomes RRHH, and the template wording is programme-level, not aimed at a person.
- Proposals: title, concrete action (in `text`), Damm initiative, suggested owner and timeframe, rationale with n and confidence, and a limits line. Owner and timeframe are suggestions and are **not tracked**. There is no done state: HR approves or discards.
- `draftRecommendations` uses the LLM only if `LLM_BASE_URL` and `LLM_API_KEY` are set, and falls back to the template library (alarm type × domain × collective, e.g. Logística + Condicions i organització gives hydration points and adjusted breaks) on any failure. No key is needed.
