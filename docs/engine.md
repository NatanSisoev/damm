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
| `escala10` | rate 0–10 | `valor_num` 0..10 | x / 10 | 0.10 |
| `escala5` | Likert / 5 faces | `valor_num` 1..5 | (x − 1) / 4 | 0.12 |
| `swipe` | yes/no, true/false | `valor_num` 0/1 | 0 or 1 | 0.25 |
| `pair` | this or that (2 statements) | `valor_num` = option index | `options[i].score` | 0.22 |
| `choice` | pick the most representative of 3–5 statements | `valor_num` = option index | `options[i].score` | 0.17 |
| `ranking` | order 3–5 statements | `value_json` = option indices, best first | **no score** (see below) | – |
| `obert` | free text only | `comentari` | **no score**, goes to themes | – |

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

All six domains stay active. Per person per day:

1. **Follow-up** (at most 1/day): if a follow-up is due, it takes a slot.
2. **HR needs** (at most 1/day by default): approved items with `necessitat_id` for this collective, highest `prioritat` first.
3. **Monitoring** fills the remaining slots. Domain priority:
   `priority_d = hr_weight(collective, d) · (info_gain_d + floor) · outlier_boost_d`
   - `info_gain_d` = drop in the segment's `SE²` from one more answer, normalised across domains. High when the domain is uncertain, low when it is well known.
   - `floor = 0.15`: no domain ever stops being asked.
   - `outlier_boost_d = 1 + 0.5 · min(segment_surprise_d, 3)`, where segment surprise is the share of recent personal `|z| ≥ 2` in that domain. Outliers make the engine insist.
   - `hr_weight` from `domain_weight` (default 1).
   - Domains are drawn **without replacement with probability ∝ priority** (stochastic, so near-equal domains alternate naturally). No two monitoring questions from the same domain in one batch.
4. **Facet**: within the chosen domain, the facet this person has gone longest without (ties random).
5. **Item and format**: among approved items of that facet for this collective, excluding items this person saw in the last `item_cooldown_days` (28), pick the format by **Thompson sampling** (below), then a random item of that format.

### Format choice by Thompson sampling

For each (collective, shift, format) keep `Beta(α, β)` (`format_stats`). Reward = a *good answer*: not careless (answer time ≥ `min_answer_ms` 1500 ms, and not the same raw value on all of the day's batch). Per decision, for each eligible format f draw `θ_f ~ Beta(α_f, β_f)` and pick `argmax θ_f · pref(collective, f)`, where `pref` comes from `format_preference` (HR; 0 = banned, default 1).

Example: HR sets Fàbriques to swipe 3, escala5 2, pair 1, ranking 0. The engine never shows rankings in Fàbriques and leans to swipes, but if night shift turns out to answer `escala5` carefully and rush through swipes, the Beta for swipe drops and `escala5` wins more often. Formats with little data have wide Betas and still get tried.

When non-response is modelled later, the same Thompson step gets an "answered" reward. Nothing else changes.

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
| `action_effect` | score before vs. after an approved `recomanacio`, on its domain |

## 7. Alarms (`senyal`)

Each alarm has `severity`, `status` (`open` → `acknowledged` → `action_linked` → `resolved`), `audience`, a trigger level and a separate clear level (hysteresis), and a cooldown of 7 days per (type, segment, domain). Warnings go in a weekly digest; critical alarms are pushed immediately. The AI may attach a proposed `recomanacio`; a human decides.

| `tipus` | Trigger (defaults) | Severity | Audience |
|---|---|---|---|
| `sharp_drop` | segment score fell ≥ 1.0 (0–10) within 14 days with confidence ≥ 60 | critical | hr_manager |
| `sustained_decline` | negative slope over ≥ 3 consecutive periods | warning | hr_manager |
| `changepoint_cluster` | ≥ 10 people in a segment with a *confirmed* drop in the same domain within 14 days | critical | hr_manager |
| `polarisation` | consensus fell ≥ 15 points | warning | hr |
| `feble` (weak signal) | small but steady shift (≥ 0.3 over 3 periods) with rising confidence | info → warning if it persists | hr |
| `emergent` | new growing comment theme (analysis module) | warning | hr |
| `baixa_participacio` | segment confidence or representativeness dropping (reserved for when non-response is modelled) | warning | hr |
| `low_confidence` | domain confidence < 40 for 14 days | info | hr |
| `improvement` | significant rise after a linked action | info | hr_manager |

Routing:
- `hr_manager` = HR plus the manager of that collective. Managers see only their own collective and only n ≥ 10. Smaller teams roll up to the next level.
- **Lideratge alarms go to HR only**, never to the manager being assessed.
- Safety or harassment content in comments never becomes an alarm that exposes the comment. The app points the person to the official confidential reporting channel (Ley 2/2023). HR only sees aggregate theme trends.

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
