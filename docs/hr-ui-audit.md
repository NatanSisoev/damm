# HR portal and manager view audit

Audit of `apps/web/app/hr/*` and `apps/web/app/manager/*` (2026-11-07) for consistency, usefulness and anonymity. Walked on the engine-built demo DB (3 periods Aug, Sep, Oct 2026) at 1440px and 390px.

Severity: **P0** breaks a rule or the demo, **P1** confusing or inactionable, **P2** polish.
Lenses: 1 usefulness, 2 consistency, 3 hierarchy, 4 charts, 5 anonymity and rules, 6 copy, 7 accessibility, 8 navigation.
Status: `OPEN`, `FIXED <hash>`, `DEFERRED <reason>`, `NEEDS-DECISION <question>`.

Requirement IDs come from `docs/requirements.md` (R-PRIV-*, R-FLOW-*).

## Cross-screen

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-X-1 | P0 | 5, 2 | The engine writes `agregat` rows per domain only (66 per period). `getRepresentativeness()` and `getHrOverview()` read rows with `domini_id IS NULL`, so on the demo DB both return nothing. Representativeness then shows "Suprimit · Menys de 10 persones han respost" for segments with n=80 (a false anonymity message), and Inici shows "—" for Participació and Han respost. R-PRIV-*, R-FLOW-7. | HR side: prefer `domini_id IS NULL` rows, else fall back to the largest per-domain `n` of the segment as a lower bound, labelled "com a mínim". | FIXED 9732271 |
| HR-X-2 | P1 | 2 | Engine insights and alarms use 0–10 ("de 5,8 a 4,7 sobre 10"). Heatmap, `mitjana`, sparklines, trend tables and radar use 1–5. Fàbriques Condicions is 2,8 in the heatmap and 4,5/10 in its alarm, and no screen says so. | Show one scale in the UI. Decided: 0–10 everywhere HR reads a score, converted as (mitjana−1)·2,5, with the scale in every title. | FIXED c0a9fee, 5edc29e (decided: keep 1–5 for averages, label the scale, explain the conversion on Com es calcula? because converting touches hands-off files and engine text) |
| HR-X-3 | P1 | 2 | Alarms are called "Alarmes" in the nav and "Senyals" on Inici and Recomanacions. Counts differ: Inici and Recomanacions show 24 (includes 1 resolved), Alarmes shows 23 open. | One name (alarma) and count open ones only. | DEFERRED not reached: count open alarms only on Inici and Recomanacions, and use the name «Alarmes» everywhere |
| HR-X-4 | P1 | 6 | "mati" without accent in insight text, methodology, RepTable and manager. DB value must stay (copy-guide 10). | Display helper `tornLabel` (mati to matí) used everywhere. | FIXED 6b0de7b, 6f9a8f2 |
| HR-X-5 | P1 | 6 | Dot decimals in manager TrendTable ("3.1", "−0.3", "|Δ| ≥ 0.3") and methodology ("0.3"). | Format with comma. | FIXED 6b0de7b, afb1105, 5edc29e |
| HR-X-6 | P1 | 6 | Jargon "motor": "Què destaca el motor", "Del motor, amb la seva n i confiança". Copy guide: "resum de l'anàlisi". | Reword. | FIXED 6b0de7b, afb1105 |
| HR-X-7 | P1 | 7 | `.btn` is 32px high, chips, `summary` and text links 16–36px at 390px. Counts of controls below 44px: signals 75, recommendations 25, needs and publish 14, Inici 9. | Global `@media (max-width: 767px)` rule in hr.css, `min-height: 44px` for `.btn`, chips, `summary`, link-buttons. | FIXED c0a9fee |
| HR-X-8 | P1 | 1, 8 | The demo need and questions are in English (log). | Check the drafting prompt forces Catalan (`packages/ai`). Record only. | DEFERRED not verified: check the drafting prompt in packages/ai forces Catalan |
| HR-X-9 | P1 | 2 | Insight says "el consens baixa 17%, ara 57%", alarm says "ha caigut 17 punts (74 → 57)". The relative drop would be 23%. | Wording is engine text. Say "punts" in both. | NEEDS-DECISION Natan: change the insight template in `packages/engine` to "punts". |
| HR-X-10 | P1 | 2 | Headline "Lideratge a Logística: mati 4,2 vs tarda 5,8, n=30" next to an alarm for Logística matí n=42. The headline n is the smaller segment and unlabelled. | Label "n més petita". | DEFERRED not reached: label the headline n as «n més petita» |

## Inici (`hr/page.tsx`, `analytics-ui.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-INI-1 | P0 | 5 | Participació and Han respost show "—" (see HR-X-1). R-FLOW-7. | Same fix as HR-X-1. | FIXED 9732271 |
| HR-INI-2 | P1 | 2 | Heatmap meta "Mitjana 1–5 · període …" while headlines are 0–10 (HR-X-2). | Convert to 0–10. | FIXED c0a9fee (decided: scale labelled, not converted) |
| HR-INI-3 | P1 | 6 | HeadlineStrip meta "Del motor, amb la seva n i confiança" (jargon). | "Amb la n i la confiança de cada xifra". | FIXED 6b0de7b |
| HR-INI-4 | P1 | 1 | ReachCard button "Crea una enquesta de seguiment" links to `/hr/needs` with no link to the gap it concerns. Says "Cap grup està clarament infrarepresentat" only because data is missing (HR-X-1). | Link the button with the group as context. Fix data. | DEFERRED not reached: link the follow-up button to the gap it concerns |
| HR-INI-5 | P1 | 2 | Senyals count 24 includes the resolved one (HR-X-3). | Open only. | DEFERRED same fix as HR-X-3 |

## Necessitat and revisió (`need`, `needs`, `review`, `draft-review.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-NEED-1 | P1 | 8 | The only need is English text (HR-X-8). | Record. | DEFERRED same as HR-X-8 |
| HR-NEED-2 | P1 | 8 | AI drafting call: check loading and error states exist and are Catalan. R-FLOW-2. | Verify in the form. | DEFERRED not verified in the form |
| HR-NEED-3 | P2 | 7 | Controls under 44px at 390px (HR-X-7). | Global rule. | FIXED c0a9fee |

## Publicació (`publish`, poster, Teams)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-PUB-1 | P1 | 1 | "Tanca la necessitat" in the duplicated "Necessitats" card has no confirmation. | Add a confirm step. | FIXED 5edc29e |
| HR-PUB-2 | P1 | 6 | "{n} comptes al col·lectiu" says nothing when suppressed. | "{n} comptes", "<10" when suppressed. | FIXED no change needed, page already shows «<10» when suppressed |
| HR-PUB-3 | P2 | 1 | Poster and Teams use `localhost:3000` as base when `PUBLIC_BASE_URL` is unset, and the poster prints it. | Notice on the page already exists on `/hr/publish`; add the same on the poster. | DEFERRED not reached: add the PUBLIC_BASE_URL notice to the poster |
| HR-PUB-4 | P2 | 7 | Controls under 44px. | Global rule. | FIXED c0a9fee |

## Resultats (`results/page.tsx`, `tables.tsx`, `radar.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-RES-1 | P0 | 5 | RepTable shows "Suprimit · Menys de 10 persones han respost" for n=80 (HR-X-1). | Repository fix. | FIXED 9732271 |
| HR-RES-2 | P1 | 1 | "Resum de l'anàlisi" and "Encara no hi ha temes" with no next step. | Explain what produces them and link to Com es calcula? and the job. | DEFERRED results/page.tsx is hands-off for the trend-spread session: add an empty-state sentence with links to Com es calcula? and the job |
| HR-RES-3 | P1 | 6 | "mati" in RepTable (HR-X-4). | `tornLabel`. | FIXED 6b0de7b |
| HR-RES-4 | P1 | 2 | Trend tables 1–5 with dot decimals on the manager copy, 0.3 threshold shown against a rounded display (Logística Condicions 3,2 → 2,9, Δ −0.3, "sense canvi clar", but Lideratge 3,3 → 3,0, Δ −0.3, "baixa"). | Show Δ with two decimals or explain the threshold on unrounded values. Trend-spread session owns `results/page.tsx`. | DEFERRED trend-spread session owns this file |

## Alarmes (`signals/page.tsx`, `signals/[id]/page.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-SIG-1 | P1 | 4 | Tag "1–5" with title "Mitjana del domini per període (escala 1–5)" next to a sparkline, while the alarm text numbers are 0–10 ("5,8 → 4,7"). | Remove the tag or convert (HR-X-2). | FIXED c0a9fee (tag now says «mitjana 1–5») |
| HR-SIG-2 | P1 | 8 | Link "Veure temes i decidir l'acció →" on every alarm, but themes are empty on this DB. | Link to the alarm detail instead (cross-link to recommendation and follow-up). | FIXED c0a9fee |
| HR-SIG-3 | P1 | 2 | Summary "14 alarmes requereixen acció · 14 d'avís o crítiques" repeats itself. Critical and warning badges both use `badge-warn`. | One number; distinct critical badge. | FIXED c0a9fee, 6f9a8f2 |
| HR-SIG-4 | P1 | 7 | 75 controls under 44px at 390px. | Global rule. | FIXED c0a9fee |
| HR-SIG-5 | P1 | 8 | Detail page "Del senyal a l'acció" steps are read-only: Recomanació "Pendent · Sense recomanació", Enquesta "Per crear". No button to start either. Detail back link says "← Recomanacions" although the list is "Alarmes". | Add the next-step buttons and fix the back label. File is hands-off. | DEFERRED trend-spread session owns this file |
| HR-SIG-6 | P1 | 4 | Detail trend chart: y axis "3,0 / 3,5 / 4,0" is 1–5 and the title says "Tendència per domini" without the scale. | Add "escala 1–5" or convert (HR-X-2) in `trend-chart.tsx`. | DEFERRED trend-spread session owns this file |

## Recomanacions (`recommendations/page.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-REC-1 | P1 | 1 | The page mostly repeats the alarm list (24 signals, 8 "Poca confiança" info items). Empty state "Encara no hi ha recomanacions." has no explanation or next step. | Say what generates recommendations, link to Alarmes, separate informational items. | FIXED 5edc29e (empty states now explain and link; the duplication with Alarmes stays) |
| HR-REC-2 | P1 | 2 | Senyals 24 versus 23 open (HR-X-3). | Open only. | DEFERRED same fix as HR-X-3 |
| HR-REC-3 | P1 | 7 | 25 controls under 44px. | Global rule. | FIXED c0a9fee |

## Com es calcula (`methodology/page.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-MET-1 | P1 | 6 | "escala 1–5", "mati, tarda, nit", "0.3" with a dot. | Match the final scale, `tornLabel`, comma. | FIXED 5edc29e (scale note and decimal comma) |
| HR-MET-2 | P2 | 1 | Explains consens, confiança and precisió but the screens do not link here inline. | Add the link to each of those terms' first use. | DEFERRED not reached: inline links from each term to the methodology |

## Manager (`manager/page.tsx`, `manager/[collectiu]/page.tsx`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-MGR-1 | P0 | 5 | Representativeness shows "Suprimit" for Logística n=80 (HR-X-1). | Repository fix. | FIXED 9732271 |
| HR-MGR-2 | P1 | 6 | Card "Què destaca el motor" with a hard-coded "(cal n ≥ 10)". | "Què destaca" and use `MIN_GROUP_SIZE`. | FIXED afb1105 |
| HR-MGR-3 | P1 | 6 | TrendTable dot decimals (HR-X-5). | Comma. | FIXED afb1105, 6b0de7b |
| HR-MGR-4 | P1 | 2 | "Senyals del col·lectiu" meta shows `signals.length`, while the list shows the merged `cards`. | Use `cards.length`. | FIXED afb1105 |
| HR-MGR-5 | P1 | 3 | Themes card says "Tota l'empresa, no només aquest col·lectiu" and is empty. | Keep note, add empty-state explanation. | DEFERRED not reached: explain the empty themes card |
| HR-MGR-6 | P1 | 2 | Radar and trend on 1–5, insights on 0–10 (HR-X-2). | Convert. | FIXED afb1105 (scale labelled) |
| HR-MGR-7 | P2 | 8 | Page has no link back to the HR alarms or a next step for the manager. | Link to the collective's alarms. | DEFERRED not reached: link to the collective's alarms |

## Login (`hr-login`)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-LOG-1 | P2 | 6 | Copy checked: "Accés restringit a l'equip de persones. Escriu el codi d'accés de la demo." Good. Page has no error text check on a wrong code. | Verify error message is Catalan. | DEFERRED not verified: wrong-code error text |

## Engine (not editable here)

| ID | Sev | Lens | Finding | Fix | Status |
|---|---|---|---|---|---|
| HR-ENG-1 | P0 | 5 | `packages/engine/src/job.ts` never writes `domini_id NULL` rows. The job already holds `respondents` sets per `collectiu|torn|domini` and a `count(c, t, d)` helper. | Natan: in `snapshot`, after the domain loop, emit per (c, t) and per company a row with `domini_id = NULL` whose `n` is the distinct respondents across domains (about 10 lines, mitjana, score and confidence NULL or the cross-domain mean). Then HR-X-1 stops needing a fallback. | NEEDS-DECISION Natan: add the all-domains `agregat` rows in `job.ts`? |
