# Demo script

Live demo of the whole challenge flow, written against the current `jan/dev`. All data is synthetic. The UI is in Catalan; labels below are the real ones from `apps/web/app`.

Flow: need → AI drafts → human approval → publish with link and QR → answer on the phone → results (radar, representativeness, suppression) → recommendation → follow-up survey.

## Status flags

| Flag | Meaning |
| --- | --- |
| ✅ Works now | Runs on current `jan/dev`. |
| ⏳ Pending Jan | Jan's branch, not on `jan/dev` yet (`jan/pwa-answer`). |
| 🔶 Needs Natan | Depends on Natan's engine, AI or analysis work (`packages/engine`, `packages/ai`, `packages/analysis`), which has not landed. Until it does, the step shows fixture data and the fallback is the script. |

Re-check every flag against `jan/dev` the day of the demo and update this table.

## Before you go on stage

**Use the trilingual demo DB: `pnpm demo-db` (writes `data/app.db`, about 90 s, join codes `DEMO-FAB`, `DEMO-LOG`, `DEMO-COM`, `DEMO-OFI`).** The two databases below are legacy and not interchangeable: both write `data/app.db`.

| DB | Command | Gives you | Lacks |
| --- | --- | --- | --- |
| Fixture | `pnpm --filter @damm/db run init` | Populated HR screens: one need with 3 AI drafts, 1,200-person population, aggregates (Logística night shift suppressed), 5 themes (one suppressed), 1 signal, 1 recommendation | Accounts and join codes of the seed |
| Seed | `pnpm --filter @damm/seed run seed` | ~1,200 employees, ~700 responses, ~500 comments, join codes `DAMM-FAB`, `DAMM-LOG`, `DAMM-COM`, `DAMM-OFI` | HR results stay empty until the analysis job (🔶 Natan) writes the aggregates |

Pick the fixture DB for the stage demo until the analysis lands. After landing, run seed, then the analysis job, and use that DB instead.

Checklist:

1. `pnpm install`, copy `.env.example` to `.env`. The LLM key stays in `.env` only; never show it.
2. Create the DB (fixture, see above), then `pnpm dev`. App at `http://localhost:3000`.
3. Phone: it cannot reach `localhost`. Set `PUBLIC_BASE_URL` in `.env` to the laptop's LAN address (for example `http://192.168.1.20:3000`) or a tunnel URL, then restart. Join links and QR use this base. Phone and laptop on the same Wi-Fi. Push notifications need public HTTPS (tunnel or quick deploy); they are not part of this script.
4. Open `/hr` in one browser window and keep a second tab ready on `/hr/signals`.
5. Dry run once end to end. Publishing and approving write to the DB; re-run the DB command to reset.

## Steps

### 1. The need

| | |
| --- | --- |
| Status | ✅ Works now |
| Who | HR person (presenter 1) |
| URL | `http://localhost:3000/hr/needs` |
| Click | On the page "Quina necessitat vols escoltar?", fill the "Necessitat" box (placeholder: "Ex.: Volem saber com viuen els equips de planta el nou sistema de torns."). Pick the "Col·lectiu", set "Durada màxima per persona (segons)". Click "Genera els esborranys". |
| Audience should notice | The need is plain language, no survey-design skill needed. A note says "Després passaràs a Revisió." |
| Fallback | If the form errors, go to `/hr/needs`: the fixture already holds a need (Fàbriques) with its drafts. |

Suggested text: "Volem saber com viuen els equips de planta el nou sistema de torns."

### 2. AI drafts

| | |
| --- | --- |
| Status | 🔶 Needs Natan. `createNeedAction` only saves the need and redirects. Draft generation (`packages/ai`) is not wired, so a new need gets no drafts today. |
| Who | HR person |
| URL | `http://localhost:3000/hr/needs` |
| Click | Open the "Esborranys pendents" list. Each card is marked "Proposta de la IA". |
| Audience should notice | The questions are proposals. The banner reads "La IA proposa, una persona decideix." and the page states "Cap pregunta entra al banc de preguntes fins que una persona l'aprova." |
| Fallback | AI or LLM down, slow, or not landed: use the three seeded drafts of the fixture need. Say "these are the drafts the AI proposed earlier" and carry on. Never wait on the gateway on stage. |

### 3. Human approval

| | |
| --- | --- |
| Status | ✅ Works now (on fixture drafts) |
| Who | HR person |
| URL | `http://localhost:3000/hr/needs` |
| Click | Edit one question's text in the "Text de la pregunta" box and click "Desa el text". Click "Aprova" on two drafts. Click "Descarta" on the third. |
| Audience should notice | A human edited and decided. Approved questions move to "Llestes per publicar". Questions linked to a need get top priority in the pool (priority 100). |
| Fallback | If an action fails, reload the page; state is in the DB. If all drafts are already approved from a rehearsal, reset the DB. |

### 4. Publish with link and QR

| | |
| --- | --- |
| Status | ✅ Works now |
| Who | HR person |
| URL | `http://localhost:3000/hr/needs` |
| Click | Click "Publicar amb enllaç i QR". The page shows the join link `<PUBLIC_BASE_URL>/join/<codi>` and a QR. The item then appears under "Publicades". |
| Audience should notice | "Publish" means the approved questions enter the survey pool and a join link and QR are generated. There is no external survey tool. |
| Fallback | QR does not scan: type the link into the phone browser. Phone cannot reach the laptop: show the QR and link on the projector and continue step 5 from a laptop browser in a private window at `/join/<codi>`. |

### 5. Answer on the phone

| | |
| --- | --- |
| Status | Onboarding ✅ Works now. Answering ⏳ Pending Jan (`jan/pwa-answer`): on `jan/dev`, `/` is still the Next template, and `GET /api/pool/next` and `POST /api/responses` do not exist. The engine that picks the questions is 🔶 Needs Natan. |
| Who | Employee (presenter 2, on a phone) |
| URL | `<PUBLIC_BASE_URL>/join/<codi>`, then `/onboarding?codi=<codi>`, then `/` |
| Click | Scan the QR. Page "Codi d'accés". Continue to "Crea el teu compte": choose "Nom d'usuari", "Contrasenya", "Repeteix la contrasenya". Note the "Codi de recuperació" shown once. Land on `/`. Answer the questions. |
| Audience should notice | No email, no phone, no personal data: a join code that identifies only company and collective, a username and a password, and a one-time recovery code. The page says "Les teves respostes són anònimes i només es mostren agregades." |
| Fallback | Answer flow not merged: stop after onboarding and say "the answer screens are in the next branch". Show `/settings` ("Configuració": change password, "Tanca la sessió"). Or play a short pre-recorded screen capture of the answer flow. Wrong or expired code gives "Codi no vàlid"; use `/login` ("Entra") with the account you made in rehearsal, or "He perdut la contrasenya" for recovery. |

The fixture DB has no join codes. For a live scan use the seed DB, or publish in step 4 (which creates a code).

### 6. Results: radar, representativeness, suppression

| | |
| --- | --- |
| Status | ✅ Works now with the fixture DB. 🔶 Needs Natan with the seed DB: the analysis job that writes the aggregates, themes and trends is not landed, so the pages are empty. |
| Who | HR person |
| URL | `http://localhost:3000/hr` |
| Click | Read "Perfil per domini" (radar). Use "Compara amb" to overlay a second series. Scroll to "Representativitat" and the "Per torn" breakdown. Scroll to "Temes dels comentaris" and "Tendències per domini". |
| Audience should notice | (a) Radar: fixed 1–5 scale, at most two series. A group under 10 people is a gap labelled "n<10", not a number. (b) Representativitat: respondents against the population ("Població"), with the "Diferència" column; gaps of 5 points or more are flagged. Night shift is the low-response group. (c) Suppressed items show "Suprimit" and the summary tile "Segments suprimits". (d) Comment themes: the "Emergent" badge on the October theme about shift communication and breaks. (e) "Cap resposta individual." appears where individual answers would be: there are none. |
| Fallback | Page empty: you are on the seed DB. Rerun the fixture DB command and reload. If the DB is gone, show the screenshots from the backup folder. |

Talking point for the suppression: Logística night shift has 6 respondents in the fixture; the tool hides it rather than showing a small, identifiable group.

### 7. Recommendation

| | |
| --- | --- |
| Status | ✅ Works now (fixture). 🔶 Needs Natan for live generation: `packages/ai` proposes recommendations from signals; today only the fixture row exists. |
| Who | HR person |
| URL | `http://localhost:3000/hr/recommendations` |
| Click | Read "Senyals" (the Logística weak signal about safety equipment and heat) and "Recomanacions". Click "Aprova" on the recommendation (or "Descarta"). |
| Audience should notice | The signal is a weak one: few mentions, easy to miss in an average. Signals under the minimum group size do not appear. The page says "Senyals detectats a l'anàlisi i accions proposades per la IA. Una persona decideix quines tirar endavant." |
| Fallback | Empty states read "Encara no hi ha senyals." and "Encara no hi ha recomanacions.": switch to the fixture DB. |

### 8. Follow-up survey

| | |
| --- | --- |
| Status | Button and redirect ✅ Works now. The follow-up questions themselves are 🔶 Needs Natan (AI drafting). |
| Who | HR person |
| URL | `http://localhost:3000/hr/recommendations`, then `/hr/needs` |
| Click | On the approved recommendation click "Crea l'enquesta de seguiment". The recommendation gets a "Seguiment creat" badge and the follow-up need shows up in `/hr/needs`. |
| Audience should notice | The loop closes: signal → recommendation → a new need → drafts → approval → publish, always with a person approving. |
| Fallback | No follow-up drafts appear: say the AI drafts for follow-ups arrive with the AI work, and show the need created in `/hr/needs`. |

## Anonymity close (1 minute, no clicking)

Say, with the repo open if there is a screen:

- HR code imports only `@damm/db/hr` and `@damm/shared`. `pnpm lint` enforces it.
- `pnpm check:anonymity` fails if HR code touches raw responses or accounts, or if the analytics view exposes `compte_id`. Run it live if time allows.
- Admin sees account counts per collective, never identities.
- The LLM is never called in a dashboard request path.

## If everything breaks

1. Reset the fixture DB, restart `pnpm dev`.
2. Walk steps 6 and 7 only (results and recommendation) and narrate steps 1–5 from the slides.
3. Last resort: the screenshots and the recording.

## Open items to close before the demo

- 🔶 Natan: AI drafts, engine, analysis job. Re-check steps 2, 5, 6, 7, 8.
- ⏳ Jan: `jan/pwa-answer` merged to `jan/dev`, then step 5 can run fully.
- Tunnel or LAN setup for the phone (`jan/tunnel`, blocked at the time of writing).
- Record the backup screen capture and take screenshots once everything is in.

## Live trigger: phone answer to laptop alarm (staged)

Set `DEMO_TRIPWIRE=1` (plus the VAPID keys, and HTTPS) on the server. On the laptop, open `/hr/settings` and turn on alarm push; the laptop must stay open or the browser running. On the phone, answer a scale question with a low value (1 or 2 of 5, up to 4 of 10, "no" on yes/no). Within a second or two the laptop gets a critical "Condicions i organització · Logística" push opening the signal. It is a **staged** demo alarm, not an engine result: its description starts with "Demo:", it uses the aggregate of a fixed segment (`DEMO_TRIPWIRE_COLLECTIVE` / `DEMO_TRIPWIRE_DOMAIN`, default Logística · Condicions i organització) only when that segment already has n >= 10, never reads or stores who answered, fires at most once every 20 s, and closes the previous demo alarm. Say so if asked. Leave the variable unset outside demos.
