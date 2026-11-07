# Question types: examples

Reference for everyone building questions, the answer UI, the seed or analysis. Engine rules are in [engine.md](engine.md), section 2. Integration is in [engine-integration.md](engine-integration.md).

- Type values are English and stable: `scale5`, `scale10`, `yes_no`, `pair`, `choice`, `ranking`, `open` (`QUESTION_TYPES` in `@damm/shared`).
- `domini_id` follows `DOMINIS` order: 1 Benestar (wellbeing), 2 Lideratge (leadership), 3 Desenvolupament (development), 4 Cultura i pertinença (culture and belonging), 5 Entorn i relacions (environment and relationships), 6 Condicions i organització (conditions and organisation).
- `score` is computed by the engine: 0..1, **1 = best outcome**, after polarity. It is the value every type shares.
- Every question can carry an optional `comentari` (comment), redacted before insert.
- `facet` groups interchangeable wordings. The engine rotates items within a facet so people do not see the same question twice.

## `scale10`: rate 0–10

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (2, 'From 0 to 10, how much does your manager listen to you?', 'scale10', 'manager_listens', 1, 'aprovada');
```

| Answer | `valor_num` | `score` |
|---|---|---|
| 8 | 8 | 0.80 |
| 2 | 2 | 0.20 |

## `scale5`: Likert or 5 faces

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (1, 'I feel overloaded with work.', 'scale5', 'workload', -1, 'aprovada');
-- 1 = strongly disagree .. 5 = strongly agree. polarity -1: agreeing is bad.
```

| Answer | `valor_num` | raw (x−1)/4 | `score` (flipped) |
|---|---|---|---|
| 5 "strongly agree" | 5 | 1.00 | 0.00 |
| 2 "disagree" | 2 | 0.25 | 0.75 |

## `yes_no`: yes/no, true/false (swipe UI)

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (6, 'This week, were you able to take the breaks you are entitled to?', 'yes_no', 'breaks_respected', 1, 'aprovada');
-- UI may be a swipe: right = yes, left = no.
```

| Answer | `valor_num` | `score` |
|---|---|---|
| Yes | 1 | 1.0 |
| No | 0 | 0.0 |

Yes/no answers carry less information than scales (higher noise), so one yes/no moves a person's level less than one 0–10 answer.

## `pair`: this or that

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (4, 'Which sentence is closer to how you feel?', 'pair', 'recognition',
  '[{"label":"My work is valued","score":0.9},
    {"label":"My work goes unnoticed","score":0.1}]', 'aprovada');
```

| Answer | `valor_num` (option index) | `score` |
|---|---|---|
| "My work is valued" | 0 | 0.9 |
| "My work goes unnoticed" | 1 | 0.1 |

Options are never scored 1.0 and 0.0, because a forced choice is coarser than a scale.

## `choice`: pick the most representative statement

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (3, 'Which sentence best describes your growth here?', 'choice', 'growth_path',
  '[{"label":"I have a clear path and I get help with it","score":1.0},
    {"label":"There are opportunities, but I have to find them myself","score":0.65},
    {"label":"I do not know how I could grow","score":0.3},
    {"label":"There is no way to grow here","score":0.0}]', 'aprovada');
```

| Answer | `valor_num` | `score` |
|---|---|---|
| "There are opportunities, but I have to find them myself" | 1 | 0.65 |

## `ranking`: order statements

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (1, 'Order what would most improve your day-to-day (most important first).', 'ranking', 'priorities',
  '[{"label":"More rest between shifts","domain_id":1},
    {"label":"A closer manager","domain_id":2},
    {"label":"More training","domain_id":3},
    {"label":"Better material and equipment","domain_id":6}]', 'aprovada');
```

| Answer | `value_json` | `score` | Borda importance per domain |
|---|---|---|---|
| equipment, rest, manager, training | `[3,0,1,2]` | NULL | Condicions 1.0, Benestar 0.67, Lideratge 0.33, Desenvolupament 0.0 |

Rankings do not feed domain scores. They feed `domain_importance` (what people care about), used by the importance vs. satisfaction insight. `domini_id` on a ranking question is only where it is filed.

## `open`: free text

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, estat)
VALUES (6, 'Is there anything about the shift system you would change?', 'open', 'shift_system', 'aprovada');
```

| Answer | `comentari` | `score` |
|---|---|---|
| "We get told about shift changes too late" | redacted text | NULL |

Goes to the themes and clustering analysis only.

## Follow-up items

Any closed type can be a follow-up (`is_followup = 1`). The engine sends it 3–7 days after an outlier answer, in the same domain and facet but with a different wording:

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, is_followup, estat)
VALUES (2, 'A few days ago you told us you did not feel listened to. How do you see it now, from 0 to 10?', 'scale10', 'manager_listens', 1, 1, 'aprovada');
```

The comment box is shown with the prompt "Has anything changed?". The text references only the person's own answer and is shown only to that person.

## Same facet, different wordings

Items with the same `facet` must measure the same thing and can use different types. The engine picks the format (by collective preference and Thompson sampling) and an item the person has not seen recently:

| facet `manager_listens` | type |
|---|---|
| From 0 to 10, how much does your manager listen to you? | scale10 |
| My manager takes into account what I tell them. | scale5 |
| When you raised a problem, did your manager act on it? | yes_no |
| "My manager listens to me" / "Talking to my manager is pointless" | pair |

Item bias learning (engine.md section 2) makes these comparable even if one wording is systematically answered higher.
