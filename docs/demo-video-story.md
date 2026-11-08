# Demo video: story version (option B)

Draft of 2026-11-08. This is an alternative to the video part of [`demo-video.md`](demo-video.md), which stays unchanged as option A (the tour of screens). Nothing here is decided: pick one option before the first rehearsal. Live part, close and format (3:00, two presenters, silent clip narrated live by P1 in Catalan) are the same in both.

## Why a second option

Option A shows the product in order: brain, analytics, manager, anonymity. It reads as a tour of charts. Option B follows one question through the product, so each screen answers the question the previous one raised.

## Story arc (about 1:04)

Thread: shift communication and breaks in Fàbriques.

| Time | Beat | On screen (Catalan) | Point |
| --- | --- | --- | --- |
| 0:00 to 0:03 | Hook | English title card | Name and context for the jury |
| 0:03 to 0:09 | Tension | "Valoració global 3,6 / 5. Tot sembla en ordre." then "I si RH pogués detectar els problemes abans que empitjorin?" | The average hides problems. The question is plain, no jargon. |
| 0:09 to 0:23 | Listen | Phone card "Et diuen amb temps els canvis de torn?" with scale 1 to 5. Answers flow into the question bank. Caps: "Preguntes petites, cada dia", "Cada resposta ajusta les preguntes següents". The Condicions i organització bar grows, red text "+ preguntes sobre torns, demà mateix". | Ask little, often, anonymously. The bank and engine adapt to answers. |
| 0:23 to 0:33 | Chase 1 | Heatmap. "On hi ha el problema?" then "Una casella rosa: per sota de la mitjana" | The average is fine, one cell is not. |
| 0:33 to 0:42 | Chase 2 | Comment themes. "Què expliquen els comentaris?" then "Un tema que creix: torns i pauses" | The comments say why. |
| 0:42 to 0:51 | Chase 3 | Signals. "És greu?" then "Alarma crítica, amb la confiança a la vista" | The platform raises it, with how sure it is. |
| 0:51 to 1:04 | Trust | "Per què es van atrevir a dir-ho?" Three panels: "Mínim 10 persones", "Cap resposta individual", "Només recomptes". Ends "Ara, en directe: RH pregunta, i ho comprova." | Anonymity as the reason the data exists, then the hand-off to the live part. |

Each Chase beat opens with a question caption and answers it with a second caption, so the viewer always knows why the next screen appears.

## Differences from option A

- Cut: manager view, night-shift representativeness gap, Logística weak signal, radar. The weak signal can move to the live part as the backup alert.
- Kept: the question bank graph (now with the retro-fit made visible), heatmap, themes, alarm, the three anonymity cards.
- Anonymity moves from a closing list to the answer of "why did they dare to speak".

## Build

Remotion project outside the repo (`~/development/escolta-video`), composition `Story`. Draft: `bash scripts/render.sh draft Story` writes `out/giveadamm-story-draft.mp4`. Option A is composition `Video` and `out/giveadamm-draft.mp4`, untouched.

## Open

- Choose A or B (or merge: B's tension and listen beats, A's manager and night-shift shots if time allows).
- Jan to review the Catalan captions.
- Check the stills still match the demo DB labels before the final render.

## Variant B2: no alarm beat (composition `Story2`)

Added 2026-11-08. Same thread and tone as B, but the alarm and recommendation are not in the clip: Jan will explain the alarm live, when it fires, and the recommendation and follow-up now live on the alarm detail page (`/hr/signals/[id]`), so they belong to the live walkthrough. The freed time covers two pillars B skipped: who answered, and the manager view. Total 1:29 (3 s hook, 5 s tension, 14 s path graph, 11 s listen, 13 s overview, 9 s themes, 9 s who, 12 s managers, 13 s trust). Visuals: left-aligned full-width caption bands (question muted, answer ink) instead of boxed pills, and an editorial numbered list for anonymity instead of three cards.

| Time | Beat | On screen (Catalan) | Point |
| --- | --- | --- | --- |
| 0:00 to 0:03 | Hook | English title card | Name and context |
| 0:03 to 0:08 | Tension | Left-aligned "Valoració global 3,6 / 5. La mitjana no ho diu tot.", then the question wipes in | The average hides problems |
| 0:08 to 0:22 | Path | Graph (a dot travels bank, Motor, Persones, and later back along the return arc): "Banc de preguntes" and "Motor" (the brain) joined by a two-way arrow "nodreix"; the Motor serves "Persones" ("serveix"). Then "Equip de RH" appears as a full-width red-outlined bar across the top (subtitle "L'IA proposa, RH decideix"; HR oversees the whole process) with three levers: "Aprova i edita preguntes" (into the bank), "Prioritza preguntes" (into the Motor) and "Campanya immediata" (straight to Persones). Last, a return arc from Persones to the Motor: "Les respostes l'ajusten", "anònimes, només en agregat". Captions "Com viatja una pregunta?", "RH supervisa tot el procés, i les respostes ajusten el motor" | The bank feeds the engine, HR steers it, answers adjust it |
| 0:22 to 0:33 | Listen | Phone question ("3 preguntes al dia"); a tap selects "2", then six small answer tokens leave the card one by one and land on Condicions i organització, whose bar grows and turns red with each landing; then "+ preguntes sobre torns, demà mateix". Captions "Preguntes petites, cada dia", "Cada resposta ajusta les preguntes següents" | Ask little, often; each answer visibly retro-fits the bank |
| 0:33 to 0:46 | Overview | Slow pan: radar, heatmap, weekly evolution per domain. "Què diuen les dades?", "Quatre col·lectius, sis dominis, en un sol mapa", "I com evoluciona cada domini, setmana a setmana" | The main analytics charts, no single pink cell |
| 0:46 to 0:55 | Themes | "Què expliquen els comentaris?" then "606 comentaris sobre torns i pauses"; the table row is marked | The comments say why (no growth claim: the still shows totals only) |
| 0:55 to 1:04 | Who answered | Representativitat table. "Qui ha respost?" then "Respostes i plantilla, col·lectiu a col·lectiu" (a label only: no claim about the synthetic numbers) | Representativeness: respondents vs population |
| 1:04 to 1:16 | Managers | Real collective page (Fàbriques), three stops down the page, each marked in red: the radar ("El perfil del seu col·lectiu, per domini"), the "Condicions i organització" priority card with its "Actua primer" action ("Què destaca l'anàlisi, i què fer primer"), the trend table row ("I com evoluciona cada domini"). Opens with "I els responsables d'equip?"; the read-only note is said aloud | Managers get their own aggregate view, with analysis and priorities |
| 1:16 to 1:29 | Trust | "L'anonimat és una regla, no una promesa", three numbered rules, then a blank paper page for Jan to improvise on (no closing sentence) | Anonymity enforced by the system, then the hand-off |

Build: `bash scripts/render.sh draft Story2` writes `out/giveadamm-story2-draft.mp4`; `final` writes `out/giveadamm-story2-final.mp4` (turn `DRAFT` off in `src/config.ts` first so no badge shows). A and B are unchanged.

Legibility (2026-11-08): B2 uses a darker muted grey (`#4f4f4b`) and larger small labels (24 to 28 px) for projector viewing. Only `Story2` is affected.

Rehearsal build for P1: composition `Story2Rehearsal` is `Story2` plus a bottom bar with a progress line, a tick at each scene start, the scene name with seconds left, and elapsed/total time. Render it separately (`npx remotion render Story2Rehearsal out/giveadamm-story2-rehearsal.mp4`); never use it as the final.

Open for B2:
- Jan to review the new Catalan: "La mitjana no ho diu tot.", "606 comentaris sobre torns i pauses", "Què diuen les dades?", "Respostes i plantilla, col·lectiu a col·lectiu" (a label only: no claim about the synthetic numbers), "I els responsables d'equip?", "Què destaca l'anàlisi, i què fer primer", "I com evoluciona cada domini", "L'anonimat és una regla, no una promesa".
- Red boxes checked against the stills (Themes row, representativity table, manager collective cards): accurate. Scrolled shots pin the sidebar crop so it reads as a real scroll; the manager view has no sidebar, so it is not pinned.
- The night-shift gap ("Per torn") is collapsed in the still, so the clip shows only the collective table.
