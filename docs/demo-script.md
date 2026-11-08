# Demo script

Live demo of the whole challenge flow, in step with the agreed 3:00 run of show in [`demo-video.md`](demo-video.md) (video about 1:05, live about 1:45, close 10 s). All data is synthetic. The UI is in Catalan; the labels below are the real ones from `apps/web`.

Flow: need in natural language, AI drafts, human approval, publish (push to the phone), answer on the phone, alarm on the laptop, then Detect, Act, Re-measure, Learn.

## Before you go on stage

1. `pnpm install`, copy `.env.example` to `.env`. Set `HR_ACCESS_CODE` (HR login is `/hr-login`, field "Codi d'accés", button "Entra"), `LLM_API_KEY`, the VAPID keys and `PUBLIC_BASE_URL`. The key stays in `.env`; never show it.
2. Build the one demo DB: `source ~/.claude/bin/heavy-gate.sh` then `pnpm demo-db` (about 90 s, writes `data/app.db`). Join codes: `DEMO-FAB`, `DEMO-LOG`, `DEMO-COM`, `DEMO-OFI`. Then `pnpm dev`, or use the Railway deploy (`docs/deploy.md`).
3. Push needs public HTTPS. The phone cannot reach `localhost`: use the deployed URL or a tunnel, and set `PUBLIC_BASE_URL` to it.
4. Health check: `pnpm --filter @damm/engine run health`.
5. Laptop: sign in at `/hr-login`. Open `/hr/settings` and turn on alarm push ("Activa els avisos", confirm with "Envia una prova"). Keep the laptop open.
6. Phone: open `<PUBLIC_BASE_URL>/join/DEMO-FAB` (or scan the QR on `/hr/publish`), "Continua", create the account ("Nom d'usuari", "Contrasenya", "Repeteix la contrasenya", "Crea el compte"), save the recovery code, allow notifications. On iOS the PWA must be added to the home screen first.
7. Pre-warm the AI drafts for the live need (below) so you can show them if the gateway is slow. Never wait on the gateway on stage.
8. Dry run once end to end. Publishing and approving write to the DB; "Restaura la demo" on `/hr/settings` (needs `DEMO_RESET_ENABLED=1`) or a fresh `pnpm demo-db` resets it.
9. Record the backup: a 15 s phone clip of the push, plus screenshots.

## Live beats

### 1. The need (1:05 to 1:25)

Who: P1 (HR). URL: `/hr/needs` (sidebar "Consultar", page "Consultes"). If the page already lists needs, click "+ Nova consulta"; otherwise the form is shown directly.

Fill in:

- Objectiu: `Volem saber com viuen els equips de planta el nou sistema de torns.`
- Context (opcional): `A l'octubre han augmentat els comentaris sobre la comunicació dels canvis de torn i les pauses. Afecta Fàbriques.`
- Què no s'ha de preguntar (opcional): `Salaris. Preguntes sobre persones concretes.`
- Col·lectiu: Fàbriques. "Com es lliura": "Diària" (the other option is "Campanya puntual").

Click "Genera els esborranys" (it shows "La IA està redactant les preguntes…"). The example buttons A / B / C pre-fill a need if you prefer; A is the shift-system one.

Say: "HR writes the need in plain words. No survey design skill needed."

Fallback: gateway slow or down, show the pre-warmed drafts. If the LLM is unavailable the drafts carry the badge "Plantilla de reserva" instead of "Proposta de la IA"; say they are template drafts.

### 2. Human approval (1:25 to 1:40)

Same page, inside the need card. Edit one question (textareas Català / Castellà / Anglès, then "Desa els textos"), click "Aprova" on two questions and "Descarta" on one. Approved questions are listed under "Preguntes aprovades". Wording warnings ("Avisos de redacció") do not block approval: you decide.

Say: "The AI proposes, a person decides. Nothing enters the pool until it is approved."

Fallback: an action fails, reload; state is in the DB. If everything is already approved from a rehearsal, reset the DB.

### 3. Publish and push (1:40 to 1:50)

Click "Publica i envia la notificació" on the need card, then confirm in the modal "Publicar la consulta" (it shows "Qui la rep", "Preguntes", "Com s'envia"). The notice reads "Consulta publicada. S'han enviat notificacions a {n} dispositius del col·lectiu." Under 10 devices it says "…a menys de 10 dispositius: no en mostrem el nombre exacte." The push lands on P2's phone: "Tens preguntes noves. Només et prendrà un minut."

Say: "Publish puts the questions in the pool and pings the collective. HR only gets a device count, and under 10 it hides even that."

Fallback: no push arrives. Open the app on the phone anyway (the questions are in the pool) and show the 15 s backup clip of the push.

Join links and QR are per collective, not per need: they live on `/hr/publish` ("Enllaços i QR per col·lectiu", with "Cartell per imprimir" and "Publica a Teams"). Show them only if asked how people get onboarded.

### 4. Answer on the phone (1:50 to 2:10)

Who: P2, on the phone, already onboarded. Open the app (`/`), answer two questions. The button reads "Envia i continua" and the end screen "Gràcies". The need's questions are served first; the daily engine can add others.

Say: "A join code, a username and a password. No email, no phone, no name. The answers are anonymous and only shown in groups of 10 or more."

Fallback: wrong or expired code gives "Codi no vàlid"; use `/login` ("Entra") with the account made in rehearsal, or the recovery code.

### 5. The alarm and the loop (2:10 to 2:50)

Who: P1, on the laptop. Run the Live trigger below (plan A, or plan B if it misbehaves) or, without it, open an existing alarm.

- Detect: `/hr/signals` (sidebar "Detectar", page "Alarmes"). Labels such as "Emergent", "Senyal feble", "Caiguda brusca", "Descens sostingut"; severities "Registre", "Avís", "Crítica". Open an alarm for its detail.
- Act: `/hr/recommendations` ("Recomanacions": "Alarmes detectades per l'anàlisi i accions proposades per la IA. Una persona decideix quines tirar endavant."). Click "Aprova" (or "Descarta") on a recommendation, then "Crea l'enquesta de seguiment"; the card gets the badge "Seguiment creat" and the follow-up appears in `/hr/needs`.
- Re-measure and Learn: the follow-up need goes through the same approval and publish, then results come back to `/hr`. The panel is titled "Panell" and shows "Perfil per domini", "Representativitat" and the KPIs; suppressed segments show "Suprimit".

Say: "Detect, act, re-measure, learn. Every step has a person approving."

Fallback: no alarm on `/hr/signals` (empty state "Cap alarma. Prem «Recalcula ara»…"): press "Recalcula ara", or use plan B, or walk an alarm that already exists in the demo DB (Fàbriques Condicions i organització, the October shift-communication theme, Oficines polarisation, the Logística heat/PPE theme).

## Close (10 s)

"Every employee can speak, HR can act, and nobody can be identified."

If there is a screen and time, the anonymity proof: HR code imports only `@damm/db/hr` and `@damm/shared` (`pnpm lint` enforces it), and `pnpm check:anonymity` fails if HR code touches raw responses or accounts or the analytics view exposes `compte_id`. Admin sees account counts per collective only. The LLM is never called in a dashboard request path.

## Cut order if over time

Manager view (`/manager`, "Vista de responsables", read-only), then the Re-measure and Learn detail, then the second approval.

## If everything breaks

1. Reset the DB (`pnpm demo-db` or "Restaura la demo"), restart `pnpm dev`.
2. Walk `/hr` and `/hr/signals` and `/hr/recommendations` only, and narrate the rest.
3. Last resort: the backup push clip and the screenshots (R-DEL-8).

## Things to confirm before the demo

- Questions a day: the engine default is 3 (`questionsPerDay`), but the join page says "Dues preguntes breus al dia". Do not state a number on stage.
- The push copy and the "Has dit, hem fet" card are in the employee strings; not seen on a device by whoever wrote this script.
- The video says P2 answers two questions: that holds only if the published need has at least two approved questions, so approve two in beat 2.

## Live trigger: phone answer to laptop alarm

**Plan A, a real engine alarm (`DEMO_LIVE_JOB=1`).** One answer from the phone makes the analysis job run and a genuine alarm appear on HR, with a push to the laptop. Nothing is staged: the alarm comes from the normal engine on real aggregates.

What is primed. The demo DB plants one segment, **Comercial · Desenvolupament**, with a slow slide and no open alarm. A published need ("We want to know how much room people in Comercial have to grow in their role", question "How much room do you have to grow in your current role?", scale 1 to 5) is served first to any Comercial account, so a fresh phone sees it at once. Period scores of the segment (n about 105): Sep 5.60, Oct 5.52, Nov 5.41. The sustained-decline rule needs the last three periods strictly decreasing and Nov minus Sep of -0.2 or lower (score points). Before the answer Nov minus Sep is -0.19, so nothing fires. One answer moves the Nov score by about -0.04 (1/5), 0 (3/5) or +0.04 (5/5): 1/5 gives Nov 5.37, so Nov minus Sep is -0.23 and the engine opens a **warning** (n >= 10, audience hr_manager) that is pushed; 3/5 (5.41) and 5/5 (5.45) change nothing. Say it plainly: the last straw on a sliding trend, not one answer deciding a score. The numbers are exact for this seed and date; `packages/engine/demo/live-check.ts` re-checks them (below).

Setup on the server (Railway service `web`, branch `jan/deploy`):

```bash
railway variables --set DEMO_LIVE_JOB=1 DEMO_RESET_ENABLED=1
```

Plus the VAPID keys and HTTPS (already needed for push). Both flags are off by default. Leave `DEMO_TRIPWIRE` unset for plan A.

Before going on stage:

1. Right after a reseed (clean DB, snapshot written by `scripts/railway-start.sh`), laptop on `/hr/settings`: turn on alarm push and confirm with the test push. The laptop must stay open.
2. Phone: open the Comercial join link (`/join/DEMO-COM`, or the QR on `/hr/publish`), create an account (demo accounts have no password, so the presenter makes a fresh one: pick any username and password, save the recovery code), allow notifications if asked. The first question of the day is the live one.
3. Rehearse once: answer 1/5, watch the alarm and push, then press "Restaura la demo" on `/hr/settings` (accounts and push subscriptions survive, the answer and alarm go). Repeat as needed.

Live: answer **1** (or 2). The job starts 1.5 s after the answer, takes about 1.5 to 2.5 s, and HR gets the push, so the alarm shows on `/hr/signals` within about 4 to 6 s (refresh the list). The answer response itself never waits for the job. The alarm is an aggregate of the whole segment; nothing records which account answered beyond the normal `resposta` row. After the demo, reset.

Check on the scratch DB without a server: `node --experimental-strip-types --experimental-sqlite --no-warnings packages/engine/demo/live-check.ts --db <copy of data/app.db>` runs a low, a neutral and a high answer on a copy and exits non-zero if the low one does not trip the segment or the others do. Run it after any change to the demo build.

**Plan B, a staged alarm (`DEMO_TRIPWIRE=1`).** Use it if the live job or the data misbehave. Set `DEMO_TRIPWIRE=1` (plus the VAPID keys, and HTTPS) on the server. On the laptop, open `/hr/settings` and turn on alarm push. On the phone, answer a scale question with a low value (1 or 2 of 5, up to 4 of 10, "no" on yes/no). Within a second or two the laptop gets a critical "Condicions i organització · Logística" push opening the signal. It is a **staged** demo alarm, not an engine result: its description starts with "Demo:", it uses the aggregate of a fixed segment (`DEMO_TRIPWIRE_COLLECTIVE` / `DEMO_TRIPWIRE_DOMAIN`, default Logística · Condicions i organització) only when that segment already has n >= 10, never reads or stores who answered, fires at most once every 20 s, and closes the previous demo alarm. Say so if asked. Leave the variable unset outside demos.
