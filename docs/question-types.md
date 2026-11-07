# Question types: examples

Reference for everyone building questions, the answer UI, the seed or analysis. Engine rules are in [engine.md](engine.md), section 2.

- Question text is in Catalan, as the app is. The English translation is given for reference.
- `domini_id` follows `DOMINIS` order: 1 Benestar, 2 Lideratge, 3 Desenvolupament, 4 Cultura i pertinença, 5 Entorn i relacions, 6 Condicions i organització.
- `score` is computed by the engine: 0..1, **1 = best outcome**, after polarity. It is the value all types share.
- Every question can carry an optional `comentari` (redacted before insert).
- `facet` groups interchangeable wordings. The engine rotates items within a facet so people do not see the same question twice.

## `escala10`: rate 0–10

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (2, 'Del 0 al 10, quant et sents escoltat pel teu responsable?', 'escala10', 'manager_listens', 1, 'aprovada');
-- EN: From 0 to 10, how much does your manager listen to you?
```

| Answer | `valor_num` | `score` |
|---|---|---|
| 8 | 8 | 0.80 |
| 2 | 2 | 0.20 |

## `escala5`: Likert or 5 faces

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (1, 'Em sento sobrecarregat de feina.', 'escala5', 'workload', -1, 'aprovada');
-- EN: I feel overloaded with work. (1 = totally disagree .. 5 = totally agree)
-- polarity -1: agreeing is bad.
```

| Answer | `valor_num` | raw (x−1)/4 | `score` (flipped) |
|---|---|---|---|
| 5 "totally agree" | 5 | 1.00 | 0.00 |
| 2 "disagree" | 2 | 0.25 | 0.75 |

## `swipe`: yes/no, true/false

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, estat)
VALUES (6, 'Aquesta setmana has pogut fer les pauses que et toquen?', 'swipe', 'breaks_respected', 1, 'aprovada');
-- EN: This week, were you able to take the breaks you are entitled to? (right = yes, left = no)
```

| Answer | `valor_num` | `score` |
|---|---|---|
| Yes | 1 | 1.0 |
| No | 0 | 0.0 |

Swipe answers carry less information than scales (higher noise), so one swipe moves a person's level less than one 0–10 answer.

## `pair`: this or that

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (4, 'Quina frase s''assembla més al que sents?', 'pair', 'recognition',
  '[{"label":"La meva feina es valora","score":0.9},
    {"label":"La meva feina passa desapercebuda","score":0.1}]', 'aprovada');
-- EN: Which sentence is closer to how you feel?
--     "My work is valued" / "My work goes unnoticed"
```

| Answer | `valor_num` (option index) | `score` |
|---|---|---|
| "La meva feina es valora" | 0 | 0.9 |
| "La meva feina passa desapercebuda" | 1 | 0.1 |

Options are never scored 1.0 and 0.0, because a forced choice is coarser than a scale.

## `choice`: pick the most representative statement

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (3, 'Quina frase descriu millor el teu creixement aquí?', 'choice', 'growth_path',
  '[{"label":"Tinc un camí clar i m''hi ajuden","score":1.0},
    {"label":"Hi ha oportunitats, però les he de buscar jo","score":0.65},
    {"label":"No sé com podria créixer","score":0.3},
    {"label":"Aquí no hi ha manera de créixer","score":0.0}]', 'aprovada');
-- EN: Which sentence best describes your growth here?
--     "I have a clear path and they help me" / "There are opportunities but I have to find them myself"
--     / "I don't know how I could grow" / "There is no way to grow here"
```

| Answer | `valor_num` | `score` |
|---|---|---|
| "Hi ha oportunitats, però les he de buscar jo" | 1 | 0.65 |

## `ranking`: order statements

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, options_json, estat)
VALUES (1, 'Ordena què milloraria més el teu dia a dia (el més important primer).', 'ranking', 'priorities',
  '[{"label":"Més descans entre torns","domain_id":1},
    {"label":"Un responsable més proper","domain_id":2},
    {"label":"Més formació","domain_id":3},
    {"label":"Millor material i equipament","domain_id":6}]', 'aprovada');
-- EN: Order what would most improve your day-to-day (most important first).
--     More rest between shifts / A closer manager / More training / Better material and equipment
```

| Answer | `value_json` | `score` | Borda importance per domain |
|---|---|---|---|
| equipment, rest, manager, training | `[3,0,1,2]` | NULL | Condicions 1.0, Benestar 0.67, Lideratge 0.33, Desenvolupament 0.0 |

Rankings do not feed domain scores. They feed `domain_importance` (what people care about), used by the importance vs. satisfaction insight. `domini_id` on a ranking question is only where it is filed.

## `obert`: free text

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, estat)
VALUES (6, 'Hi ha alguna cosa del sistema de torns que canviaries?', 'obert', 'shift_system', 'aprovada');
-- EN: Is there anything about the shift system you would change?
```

| Answer | `comentari` | `score` |
|---|---|---|
| "Ens avisen dels canvis de torn amb massa poc temps" (EN: "We get told about shift changes too late") | redacted text | NULL |

Goes to the themes and clustering analysis only.

## Follow-up items

Any closed type can be a follow-up (`is_followup = 1`). The engine sends it 3–7 days after an outlier answer, in the same domain and facet but with a different wording:

```sql
INSERT INTO pregunta (domini_id, text, tipus, facet, polarity, is_followup, estat)
VALUES (2, 'Fa uns dies ens vas dir que no et senties escoltat. Com ho veus ara, del 0 al 10?', 'escala10', 'manager_listens', 1, 1, 'aprovada');
-- EN: A few days ago you told us you did not feel listened to. How do you see it now, from 0 to 10?
```

The comment box is shown with a prompt ("Ha canviat alguna cosa?" / "Has anything changed?"). The text references only the person's own answer and is shown only to that person.

## Same facet, different wordings

Items with the same `facet` must measure the same thing and can use different types. The engine picks the format (by collective preference and Thompson sampling) and an item the person has not seen recently:

| facet `manager_listens` | type |
|---|---|
| Del 0 al 10, quant et sents escoltat pel teu responsable? | escala10 |
| El meu responsable té en compte el que li dic. | escala5 |
| Quan li has plantejat un problema, el teu responsable t'ha fet cas? | swipe |
| "El meu responsable m'escolta" / "Parlar amb el meu responsable no serveix de res" | pair |

Item bias learning (engine.md section 2) makes these comparable even if one wording is systematically answered higher.
