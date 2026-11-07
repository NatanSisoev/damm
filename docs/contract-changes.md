# Shared contract changes

Log of changes to the shared contract (`packages/db/schema.sql`, `packages/shared`). **Newest first.** Agents: read this after pulling `main`, before building on the schema or types.

Each entry says who changed what, why, and what the other side must do.

## 2026-11-07 · Natan · Engine tables, new question types, alarms

Branch `natan/engine-spec`. Design: [engine.md](engine.md). Examples of every question type: [question-types.md](question-types.md).

All changes are **additive**. No existing table, column or Catalan name was renamed or removed, and every new TypeScript field is optional, so existing code keeps compiling. New identifiers are in English (team decision: new code in English, existing Catalan names kept for now).

### `pregunta`
- `tipus` accepts two new values: **`pair`** (this or that) and **`choice`** (pick the most representative statement). `swipe` remains the yes/no and true/false type.
- New columns:
  - `facet`: groups interchangeable wordings of the same thing.
  - `polarity`: 1 or -1; -1 means a negatively worded item.
  - `options_json`: pair/choice `[{label, score}]`, ranking `[{label, domain_id}]`.
  - `is_followup`.
- **Jan, action:** the seed's `ranking` items need `options_json` with `domain_id` per option, and items should get a `facet`. The answer UI should render `pair` and `choice` from `options`.

### `resposta`
- New columns:
  - `value_json`: ranking order, as option indices with the best first.
  - `score`: engine-normalised 0..1, where 1 is best. Set by the engine; nobody else computes it.
  - `answer_ms`: time from display to answer.
- `valor_num` for `pair`/`choice` is the chosen option index.
- `v_resposta_analitica` now also exposes `score`. It still has no `compte_id`.
- **Jan, action:** `POST /api/responses` should accept `valueJson` and `answerMs` (`RespostaInput`, both optional).

### `agregat`
- New engine columns `score` (0..10), `confidence` (0..100) and `consensus` (0..100). **`mitjana` is unchanged** (still what the dashboard uses, 1..5).
- The suppression check now also requires these to be NULL.
- **Jan, optional:** the results page can show confidence and consensus next to each cell.

### `senyal` (alarms)
- New `tipus` values: `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `low_confidence`, `improvement`.
- New columns, all with defaults:
  - `torn_id` and `domini_id`;
  - `severity`: info / warning / critical;
  - `status`: open / acknowledged / action_linked / resolved;
  - `audience`: hr / hr_manager. Lideratge alarms are always `hr`.
  - `created_at`.
- **Jan, action:** the HR signals page should handle the new types. Status changes come from HR actions.

### New tables
- **Engine-only, per account.** Treat them like `resposta`: HR code must never read them. Add them to `scripts/check-anonymity.mjs`.
  - `assignment`: daily batch per account, 3 questions, fixed for the day.
  - `person_domain_state`: personal trajectory per account × domain.
- **Engine state, no account data:**
  - `item_stats`: learned item bias.
  - `format_stats`: Thompson sampling Beta counts per collective × shift × format.
- **HR-editable config:**
  - `domain_weight`: per collective × domain, default 1.
  - `format_preference`: per collective × format; 0 = never shown.
  - `engine_config`: key/value parameters.
- **Aggregate outputs, read by the dashboard:**
  - `insight`: kinds listed in `InsightKind`.
  - `domain_importance`: from rankings.
  - Both are suppressed below `MIN_GROUP_SIZE`.

### `GET /api/pool/next`
- Now returns **today's batch**: `questions_per_day` (3) questions, the same ones all day, now including `options`. No timeouts: people answer whenever they want.
- The engine will provide the function that builds the batch. The route should call it instead of picking questions itself.

### `packages/shared`
- `PreguntaTipus`: added `pair` and `choice`.
- `SenyalTipus`: added the new alarm types.
- New types: `Severity`, `AlarmStatus`, `Audience`, `AssignmentReason`, `InsightKind`, `ScoredOption`, `RankingOption`, `Insight`.
- Optional fields added to `Pregunta`, `RespostaInput`, `Agregat` and `Senyal`.
