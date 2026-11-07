# End-to-end test plan

A manual runbook for the full loop plus a catalogue of smaller scenarios. Reworked 2026-11-07 against `docs/user-flows.md` (written against `jan/dev` at 6474268, engine wired, account management and the Alarmes page built). Every case cites the flow it tests (`F-EMP-*`, `F-HR-*`, `F-MGR-*`, `F-PRIV-*`, `F-JOB-*`) and the requirement IDs it covers (`R-*`, `N-*`, from `docs/requirements.md`). The exact Catalan text and URLs come from `docs/user-flows.md`; when the browser shows something different, that is a finding, not a plan error. Re-read the flow before filing it.

## How to use this document

- Run section 1 once per clean state, then the main scenario (section 2) top to bottom, then pick the further scenarios (section 3) that the change touched.
- Every case has a mode tag:
  - **[B]** a browser agent can do it in the in-app browser against `http://localhost:3000`. Use `resize_window` preset `mobile` (375x812) for employee screens and `desktop` for HR.
  - **[T]** shell command (`sqlite3`, `curl`, `pnpm`, `bash`). Heavy commands start with `source ~/.claude/bin/heavy-gate.sh` and run one at a time.
  - **[P]** needs a real phone. **Jan does these**; a browser agent marks them `SKIP-P` in the log.
- Result codes in the log: `P` pass, `F` fail, `KG` known gap observed exactly as described (not a failure), `ABS` feature is not built and its absence was confirmed (pass), `SKIP-P` phone only, `N/A` could not run (say why).
- **Expected gaps are tested as absent.** A case marked ABS passes when the feature is missing as described. A case marked KG passes when the documented gap behaviour is seen. If the feature turns out to be built, mark `F` with a note: the plan and `user-flows.md` are then stale.
- Read DB values with `sqlite3 data/demo.db "..."` ([T]). Never print secrets.

## Not built (tested as absent)

| Feature | Where tested | Flow |
|---|---|---|
| Web push (toggle in `/settings` and on `/`, send on publish) | M-12, M-13, S-30 to S-33 | F-EMP-9, F-JOB-4 |
| Named HR users, per-person audit (one shared access code; approver is the constant `hr-demo`) | S-75, S-89 | F-HR-1, F-PRIV-5 |
| Manager scoping (any collective reachable behind the HR gate), manager role, centre or shift question in onboarding | M-23, S-72, S-89 | F-MGR-1, F-MGR-2, F-EMP-2 |
| Configurable retention (only delete-account exists) | S-25, S-89 | F-EMP-10, F-PRIV-5 |
| `POST /api/jobs/run`, comment theme clustering job | S-89 | F-JOB-1 |
| Conditional logic between questions, quality warnings beyond duration | S-65 | F-HR-2 |
| Sending the Teams card (only the copyable payload exists) | M-9 | F-HR-4 |

## 1. Setup

### 1.1 Clean clone

```bash
git clone <repo-url> damm && cd damm
git switch main
pnpm install
cp .env.example .env
```

Fill `.env` by hand. Never paste values into this document, a ticket or a chat. Variable names:

| Variable | Needed for | If empty |
|---|---|---|
| `HR_ACCESS_CODE` | HR gate (GATE-ON) | Gate is off and `/hr` opens directly. Set it for every run in this plan. A browser agent reads it from `.env` with a shell command and types it into the field; it never writes the value in a report or log |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | AI drafts (LLM-ON) | Drafts fall back to templates, badge "Plantilla de reserva" (LLM-OFF) |
| `SESSION_SECRET` | Employee session cookie `damm_session` | Set it, or sessions are not stable across restarts |
| `PUBLIC_BASE_URL` | Base of join links and QR (default `http://localhost:3000`). Missing from `.env.example`, see Findings | Links point to localhost |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push (generate with `npx web-push generate-vapid-keys`) | Push off: no toggle, publish says notifications are off |
| `TEAMS_WEBHOOK_URL` | Real post of the Teams card | Not built, no effect |

### 1.2 Database

The runs of this plan use the **demo DB** (three months of synthetic answers, planted stories):

```bash
source ~/.claude/bin/heavy-gate.sh
pnpm --filter @damm/engine run demo        # about 4 minutes, writes data/demo.db
DB_PATH=data/demo.db pnpm dev
```

Join codes in the demo DB are `DEMO-<first three letters of the collective>`. Read the real values before testing and write them in the log:

```bash
sqlite3 data/demo.db "select * from joincode"
```

Alternative for the seed DB (`DB-seed`): `pnpm --filter @damm/db run init` then `pnpm --filter @damm/seed run seed`, codes `DAMM-FAB`, `DAMM-LOG`, `DAMM-COM`, `DAMM-OFI`, summary line `Sub-threshold segments (collective x shift, n<10): 1 -> Logística/nit (n=6)`. A case that names a code writes `<LOG>` for "the Logística join code of the DB in use" (`DEMO-LOG` on the demo DB). Optional: `pnpm --filter @damm/seed run comments` (template comments) or `-- --llm`.

### 1.3 Start the app and checks

```bash
DB_PATH=data/demo.db pnpm dev
```

In Claude Code the preview config is `web` in `.claude/launch.json`. Stop the server when the run ends.

```bash
source ~/.claude/bin/heavy-gate.sh
pnpm lint
pnpm check:anonymity
pnpm build
```

All three must pass. Run them one at a time (memory), never while the demo build runs.

### 1.4 Tunnel for the phone (Jan only)

A phone cannot reach `localhost`. Start a tunnel to port 3000, set `PUBLIC_BASE_URL` in `.env` to its URL, restart `pnpm dev`, and check that `/hr/publish` links and QR carry the tunnel host. LAN variant: `PUBLIC_BASE_URL=http://<laptop-ip>:3000`. Only the [P] steps need this.

### 1.5 Test devices

| Device | Use |
|---|---|
| In-app browser, mobile preset 375x812 | Employee flow for browser agents |
| In-app browser, desktop | HR and manager side |
| Second browser profile or tab with cleared cookies | Second account, rate-limit and wrong-password tests |
| Android Chrome, iPhone Safari (Jan) | [P] steps: QR scan, home-screen install, confirm no push prompt |

### 1.6 Reset between runs

| What | How |
|---|---|
| Database | Stop the server, rebuild with 1.2 (demo) or `rm data/app.db` and re-seed |
| HR session | Delete cookie `hr_access` (path `/hr`, 12 h) |
| Employee session | "Tanca la sessió" in `/settings`, or clear site data (cookie `damm_session`, 30 days) |
| Answer drafts | `localStorage` keys starting with `damm:draft:v1:` |
| Rate limit | In memory per username, per process: restart the server |

Always write `git rev-parse --short HEAD` in the log.

## 2. Main scenario: the full loop

Covers R-FLOW-1 to R-FLOW-8, R-CH-1, N-7. Preconditions: 1.1 to 1.3 done on the demo DB, GATE-ON, LLM-ON preferred (LLM-OFF still passes with the template badge). HR works in a desktop-size tab, the employee in a mobile-size tab. 25 steps.

### Phase A. HR side

| # | Flow | Action | Expected | Req | Result |
|---|---|---|---|---|---|
| M-1 | F-HR-1 | [B] Open `/hr` with no cookie | Redirect to `/hr-login?next=/hr`. Page "Portal de persones", text "Accés restringit a l'equip de persones. Introdueix el codi d'accés de la demo.", field "Codi d'accés", button "Entra" | R-X-3 | ☐ |
| M-2 | F-HR-1 | [B] Enter a wrong code, press "Entra" | Stays on the page with the alert "Codi incorrecte." No `hr_access` cookie | R-PRIV-3 | ☐ |
| M-3 | F-HR-1 | [B] Enter the right code (from `.env`), press "Entra" | Cookie `hr_access` set, lands on `/hr`. Nav: "Inici", "Necessitats", "Enllaços i QR", "Resultats", "Alarmes" (with a count badge), "Recomanacions", "Com es calcula?", "Vista de responsables" | R-X-3, R-PRIV-9 | ☐ |
| M-4 | F-HR-2 | [B] "Necessitats", open "Nova necessitat", press the example "B · Logística des del mòbil" | Fields "Objectiu", "Context", "Què no s'ha de preguntar", "Col·lectiu" (Logística) and "Durada màxima per persona (segons)" (60) are filled | R-FLOW-1a to 1e | ☐ |
| M-5 | F-HR-2 | [B] Press "Generar esborranys" | Button "Generant…" and text "La IA està redactant les preguntes…". Redirect to `/hr/needs`. A card in state "Esborrany" with badge "Proposta de la IA" (or "Plantilla de reserva" if LLM-OFF), 3 to 6 questions, estimated time "~N s de 60 s". [T] `sqlite3 data/demo.db "select estat, generada_per_ia from pregunta where necessitat_id=(select max(id) from necessitat)"` shows only `draft`, none `aprovada` | R-FLOW-2a to 2g, R-X-3 | ☐ |
| M-6 | F-HR-3 | [B] In the draft: edit one text and press "Desar text"; move one with the up or down control; press "Regenerar" on one; press "Descartar" on one; edit title and introduction and press "Desar títol i introducció" | Each change survives a reload. A discarded question leaves the draft list (`estat = 'retirada'` in the DB). Order follows the move. An over-long set shows "Atenció: el temps estimat … supera la durada màxima" (see S-65) | R-FLOW-3a to 3c | ☐ |
| M-7 | F-HR-3 | [B] Press "Aprovar" on every remaining question | Each moves to "Preguntes aprovades"; when none is left to review the need shows "Llesta per publicar". [T] `select estat, prioritat, aprovada_per, aprovada_el from pregunta where necessitat_id=(select max(id) from necessitat)`: `aprovada`, `100`, `hr-demo`, a timestamp | R-FLOW-3d, R-X-3, R-PRIV-7, R-PRIV-10 | ☐ |
| M-8 | F-HR-4 | [B] Press "Publicar i avisar per notificació" | State "Publicada"; a notice "S'han enviat notificacions a … dispositius del col·lectiu." ("menys de 10" under 10; "notificacions desactivades" without VAPID keys). No new `joincode` or `publicacio` row. With M-12 done on a Logística account, that browser shows "Escolta activa" | R-FLOW-4a, R-FLOW-5d | ☐ |
| M-9 | F-HR-4 | [B] Open "Enllaços i QR" (`/hr/publish`). For Logística press "Copia", open "Cartell per imprimir" (`/hr/publish/<codi>/poster`) and "Publica a Teams" (`/hr/publish/<codi>/teams`) | Title "Enllaços i QR per col·lectiu", one card per collective with code, link, QR, "comptes al col·lectiu" (a count under 10 reads "<10"). The poster is an A4 page. The Teams page shows the Adaptive Card payload titled "Escolta activa"; sending to Teams is not built (ABS, N-1 roadmap in `docs/teams-integration.md`) | R-FLOW-4b to 4d, N-1 | ☐ |

### Phase B. Employee side

Use the mobile preset. Create the account with the join code of the need's collective (Logística).

| # | Flow | Action | Expected | Req | Result |
|---|---|---|---|---|---|
| M-10 | F-EMP-1 | [B] Open `/join/<LOG>` with no cookie. [P] Jan also scans the QR on a phone | Eyebrow = company, title "Benvinguda", lede "Et donem la benvinguda a {empresa}. Les teves respostes són anònimes i només es mostren de forma agregada.", "Col·lectiu" card showing Logística, note "Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més.", link "Com tractem les teves dades", button "Continua". Press "Continua": URL `/onboarding?codi=<LOG>` | R-FLOW-5b, R-PRIV-13 | ☐ |
| M-11 | F-EMP-2 | [B] On `/onboarding` fill "Nom d'usuari" `usuari.prova`, "Contrasenya" and "Repeteix la contrasenya" with a test password of 8+ characters, press "Crea el compte" | Cookie `damm_session` set. Title "Compte creat" and a recovery code in groups of 4 with "Desa'l ara. Aquest codi només el veuràs una vegada." The continue button is disabled until "L'he desat en un lloc segur" is ticked; then it goes to `/`. No email, phone or name field anywhere. [T] `compte` has one new row with hex `password_hash`, `salt`, `recovery_hash` and no recovery code in plain text | R-PRIV-4, R-PRIV-13 | ☐ |
| M-12 | F-EMP-9 | [B] Open `/settings` on the mobile preset (VAPID keys set) and press "Activa les notificacions" | Card "Notificacions"; no prompt before the tap; after allowing, "Desactiva les notificacions" shows. [T] `select count(*) from push_subscripcio` = 1 for this account | R-FLOW-5d, N-12 | ☐ |
| M-13 | F-EMP-9 | [B] After M-8, click the notification | The app focuses or opens at `/` with today's questions. [P] Jan: on a phone over the HTTPS tunnel, the same notification arrives | R-FLOW-5d | ☐ |
| M-14 | F-EMP-5 | [B] Open `/` and answer today's questions. For an open question type "Truqueu al 600123456, sóc l'Anna Puig" | "Carregant les preguntes d'avui…", then "Pregunta 1 de N", badge "Anònim", progress bar, submit "Envia i continua" (last: "Envia"), "Enviant…" while sending, `POST /api/responses` answers 204. N is 3 by default. The new Logística need's question is in the batch (HR need comes after any follow-up and before monitoring). [T] the stored `comentari` is `[nom]` and `[telèfon]` in place of the name and the number, no raw text | R-FLOW-5a, R-FLOW-6a, R-PRIV-1 | ☐ |
| M-15 | F-EMP-5 | [B] After the last answer, then reload `/` | h2 "Gràcies", lede "Has respost les {n} preguntes d'avui. Demà en tens de noves.", note "🔒 Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més.", then the card "Has dit, hem fet". Reload gives the same batch, nothing left to answer. A replayed `POST` gives 409 `already_answered` (S-43) | R-FLOW-5c, R-FLOW-5f | ☐ |

### Phase C. Enough answers, analysis, HR reads

| # | Flow | Action | Expected | Req | Result |
|---|---|---|---|---|---|
| M-16 | F-HR-5 | [B] In `/hr/results` look for the new need's question after the single answer from M-14 | One respondent is below the minimum group size 10, so nothing about the new need is shown with a value ("Suprimit" or absent). Segments of the demo data with n of 10 or more show values. Optional route to reach n of 10: ten extra accounts by hand (fresh cookie window each) then answer; no helper script exists | R-PRIV-2, R-DATA-1 | ☐ |
| M-17 | F-JOB-1, F-JOB-2 | [T] `source ~/.claude/bin/heavy-gate.sh` then `DB_PATH=data/demo.db pnpm --filter @damm/engine run job`. [B] reload `/hr/results` | A JSON report with counts for aggregates, insights and alarms, no error. The scheduler also runs it every 10 minutes (server log line). Segments under 10 stay suppressed. The LLM is not called by any dashboard request. Idempotence is S-86 | R-FLOW-6b to 6e, N-2 | ☐ |
| M-18 | F-HR-5 | [B] Open `/hr/results` and scroll | Header "Resultats", subtitle "Sempre en agregat. Els segments amb menys de 10 respondents es mostren com a Suprimit", KPIs "Comptes actius", "Temes detectats", "Temes emergents", "Segments suprimits". Sections "Perfil per domini" (radar), "Temes dels comentaris", "Representativitat", "Tendències per domini" (mean 1 to 5 with n and precision indicativa, moderada, sòlida), "Comptes per col·lectiu" ("Només recomptes, mai identitats"). Choose a period in "Compara amanb" is `?vs=`: the select reads "Compara amb" and switches the comparison | R-FLOW-7a to 7f, R-CH-2 | ☐ |
| M-19 | F-HR-5 | [B] Read "Representativitat" per collective and per shift | Columns respostes, població, diferència; differences of 5 pp or more are marked; the night shift shows low response; night rows with n under 10 read "Suprimit" with the hint "Menys de 10 respondents" | R-DIFF-1, R-BIAS-1, N-2 | ☐ |
| M-20 | F-HR-7 | [B] Open `/hr` (home), then "Alarmes" (`/hr/signals`), then "Veure detall →" on one alarm | Home shows counts, radar, pending items and recent signals. `/hr/signals`: title "Alarmes", subtitle "Senyals que detecta el motor a partir dels agregats. Cap és individual; cada una és revisada per una persona.", button "Recalcula ara", each item with type and severity badges, "Només RH" on HR-only alarms, "{periode} · n={n}", status buttons. Detail `/hr/signals/<id>`: "Estat del senyal:" buttons, card "Del senyal a l'acció" with four steps "Fet" or "Pendent", button "← Recomanacions". Changing the status survives a reload (see S-85 for transitions) | R-FLOW-7e, R-FLOW-6e, R-DIFF-3 | ☐ |
| M-20b | F-HR-5 | [B] Insight cards on `/hr/results` (demo DB) | Cards "Estat del domini", "Canvi destacat", "Polarització", "Importància i puntuació" (quadrants "Actua primer", "Mantén", "Vigila", "Prioritat baixa"), "Trajectòries", "Confirmació del seguiment", "Diferència entre grups". Bodies like "Puntuació x/10 … confiança … consens …", "↑ Puja" or "↓ Baixa", each with a badge `n=`. A suppressed row shows no value; no card names a person or a group under 10 | R-FLOW-7, R-PRIV-2 | ☐ |
| M-21 | F-HR-7 | [B] `/hr/recommendations` (title "Recomanacions"). On one recommendation of Logística press "Aprovar"; on another press "Descartar" | `recomanacio.estat` goes `proposada` to `aprovada` or `descartada`. Nothing is executed. A decided recommendation has no buttons any more | R-FLOW-8a, 8c, R-X-3 | ☐ |
| M-22 | F-HR-8, F-EMP-8 | [B] On the approved Logística recommendation press "Crear enquesta de seguiment" | Redirect to `/hr/needs`, a new need in "Esborrany", AI drafted, nothing approved. Back on `/hr/recommendations`: badge "Seguiment creat", button gone. Approve its questions and publish (as M-7, M-8). On the employee tab `/`, the card "Has dit, hem fet" lists the approved action with the period badge, "a partir de les respostes de {n} persones" and the badge "Enquesta de seguiment en marxa" | R-FLOW-8b, 8d, N-5 | ☐ |

### Phase D. Manager and close

| # | Flow | Action | Expected | Req | Result |
|---|---|---|---|---|---|
| M-23 | F-MGR-1, F-MGR-2 | [B] Open `/manager`, then each of the four collectives, then `/manager/Inexistent` | `/manager`: title "Vista de responsables", subtitle "Tria el col·lectiu del qual vols veure els resultats.", card "Col·lectius" with the read-only note and four links. Each `/manager/<name>` opens (**all four reachable, no 403: ABS of scoping, N-8**) with cards "Perfil per domini", "Recomanacions aprovades" (only `aprovada`, only that collective), "Què destaca el motor" (at most 8; empty text "Encara no hi ha prou respostes per destacar res (cal n ≥ 10)."), "Tendència per domini", "Representativitat", "Temes dels comentaris" (labelled "Tota l'empresa, no només aquest col·lectiu"), "Senyals del col·lectiu" (empty "Cap senyal per a aquest col·lectiu."). HR-only alarms (`audience` HR, for example the Lideratge changepoint of Logística morning) never appear. `/manager/Inexistent`: 404 | R-U-3, N-8, R-FLOW-6, R-FLOW-7 | ☐ |
| M-24 | F-HR-9, F-EMP-5 | [B] In `/hr/needs` press "Tanca la necessitat" on the test need. Filter `/hr/needs?estat=tancada`. Then open a **new account** of the same collective (fresh cookie window, `<LOG>`) and look at `/` | Card shows "Tancada" and the hint "Decisió de l'equip: no hi entren noves respostes de seguiment."; the filter lists it. **KG (F-HR-9 B1):** the new account still receives the closed need's question, because the pool ignores `necessitat.estat`. Record `KG` when it is served; `F` only if the page crashes. Closing twice is a no-op; the join code stays active (S-14) | R-FLOW-8c, R-DEL | ☐ KG |

That makes 25 steps (M-1 to M-24 plus M-20b). Push steps M-12 and M-13 need VAPID keys in `.env`; a real phone also needs the HTTPS tunnel.

## 3. Further scenarios

IDs are `S-n`. Each row has the flow, requirements, mode, steps and the expected result.

### 3.1 Anonymity and suppression

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-1 | F-HR-5, F-PRIV-2 | R-PRIV-2, R-DIFF-2 | [B] In `/hr/results` look at the night-shift segments (demo DB: Fàbriques and Logística night; seed DB: Logística/nit, 6) in every table and chart | Shown as "Suprimit" with the hint "Menys de 10 respondents" in profile, representativity, trends and signals. Themes with under 10 comments show "Suprimit" with "Menys de 10 comentaris". "Segments suprimits" counts them | ☐ |
| S-2 | F-HR-6, F-PRIV-2 | R-FLOW-6, R-PRIV-1, R-PRIV-2 | [B] Press "Exporta CSV" (or use S-88 for the headers) and read the rows of a sub-10 group | `suprimit=1` and no value on those rows. No account id, username or free text anywhere in the file | ☐ |
| S-3 | F-HR-5 | R-PRIV-2 | [B] Complementary suppression: where one segment of a total is hidden, check its sibling | A second segment is also hidden, or the total is not shown, so the hidden value cannot be got by subtraction | ☐ |
| S-4 | F-HR-6, F-HR-1 B1 | R-PRIV-3 | [T] `curl -i http://localhost:3000/hr/results/export` with no cookie (GATE-ON) | Redirect to `/hr-login`, no CSV body | ☐ |
| S-5 | F-PRIV-1 | R-PRIV-3, R-PRIV-9, R-X-2 | [T] `bash scripts/security-demo.sh` | Plants a forbidden import in HR code; `pnpm lint` and `pnpm check:anonymity` fail; the script cleans up; both pass again; `git status` is clean | ☐ |
| S-6 | F-PRIV-1, F-PRIV-5 | R-PRIV-4, R-PRIV-9 | [T] Walk `docs/security-demo.md` steps (c), (d), (e). Also `sqlite3 data/demo.db "pragma table_info(v_resposta_analitica)"` | (c) suppression plus CSV, (d) the view has no `compte_id` column, (e) `scripts/security-demo-account.mts` on a copy of the DB shows scrypt hashes and the recovery hash, never plain text | ☐ |
| S-7 | F-PRIV-2 | R-PRIV-1, R-PRIV-9 | [B] Walk every HR page (`/hr`, `/hr/needs`, `/hr/publish`, `/hr/results`, `/hr/signals`, `/hr/signals/<id>`, `/hr/recommendations`, `/hr/methodology`) and every manager page, with `get_page_text` | No username, no account id, no raw comment tied to one person, no value for a group under 10 | ☐ |
| S-8 | F-PRIV-3, F-HR-4 | R-PRIV-3, R-PRIV-9 | [B] Look at "Comptes per col·lectiu" in `/hr/results` and "comptes al col·lectiu" in `/hr/publish` | Counts only; a count under 10 reads "<10"; no list of accounts exists anywhere in HR | ☐ |
| S-9 | F-PRIV-6 | R-X-1, R-DATA-1 | [T] `git ls-files` contains no `.env`; `git grep -n -i "api_key\|secret" -- . ':!docs' ':!*.example'` shows only variable names, no values; `.env.example` values are empty; the seed and comments JSON contain no real names | No secret and no real person or Damm data in the repo or the DB | ☐ |

### 3.2 Join edge cases

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-10 | F-EMP-1 B2 | R-FLOW-5b | [B] `/join`, type `dammfab` (or `demolog`), press "Entra" | Goes to `/join/DAMMFAB`, shows "Codi no vàlid". The form does not insert the hyphen (known finding, KG) | ☐ KG |
| S-11 | F-EMP-1 B1 | R-FLOW-5b | [B] Type ` demo log ` and `demo_log` (or `damm fab`, `damm_fab`) | Both become the hyphenated uppercase code and show the welcome page | ☐ |
| S-12 | F-EMP-1 B4 | R-FLOW-5b | [B] Open `/join/` plus the code in lowercase | Works, the code is uppercased | ☐ |
| S-13 | F-EMP-1 B5 | R-FLOW-5b | [B] Open `/join/XXXX` | "Codi no vàlid", text "Aquest codi no existeix o ja no està actiu. Comprova l'enllaç o demana un codi nou al teu equip.", link "Torna a provar amb un altre codi" to `/join` | ☐ |
| S-14 | F-HR-9 B3, F-EMP-1 B6 | R-FLOW-8c | [B] Close a need (M-24), then open its join link again | The join code stays active and the welcome page shows. A code with `joincode.actiu = 0` (set with `sqlite3` on a copy) shows the "Codi no vàlid" screen | ☐ |
| S-15 | F-EMP-2 B1 to B4 | R-PRIV-13 | [B] Onboarding validation, one at a time | Mismatched repeat: "Les contrasenyes no coincideixen." Username of 2 characters or with spaces or accents: "L'usuari ha de tenir entre 3 i 30 caràcters: lletres minúscules, xifres, punt, guió o guió baix." Password under 8: "La contrasenya ha de tenir almenys 8 caràcters." Existing username: "Aquest nom d'usuari ja existeix. Prova'n un altre." Capital letters are lowercased first, so `Prova` is accepted as `prova` | ☐ |
| S-16 | F-EMP-1 B3 | R-FLOW-5b | [B] On `/join` submit the empty field | Redirected back to `/join` (title "Escoltem la teva veu", field "Codi d'unió", placeholder `DAMM-XXX`, button "Entra") | ☐ |
| S-17 | F-EMP-1 B7 | R-FLOW-5b | [B] Open `/onboarding?codi=NOPE` directly | "Codi no vàlid" with the link "Introdueix un altre codi" | ☐ |
| S-18 | F-EMP-2 B5 | R-PRIV-13 | [T]+[B] Open `/onboarding?codi=<code>`, then set that code inactive in the DB (`update joincode set actiu=0 where codi='<code>'` on a scratch copy of the DB in use, then restart), then press "Crea el compte" | "Aquest codi no és vàlid o ja no està actiu." and no `compte` row is created | ☐ |

### 3.3 Account lifecycle

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-19 | F-EMP-3 B4 | R-PRIV-13 | [B] Log in with `USUARI.PROVA` | Matches `usuari.prova` (lowercased), home loads | ☐ |
| S-20 | F-EMP-3 | R-PRIV-13, R-FLOW-5a | [B] `/` with no cookie, then `/login` | `/` redirects to `/login`. Title "Torna a entrar", lede "Continua on ho vas deixar.", buttons "Entra" and "He perdut la contrasenya", line "Primera vegada? Obre l'enllaç d'invitació del teu equip.". Right credentials lead to `/` with today's questions | ☐ |
| S-21 | F-EMP-3 B1 | R-PRIV-13 | [B] Wrong password, then unknown username | Same text both times: "Usuari o contrasenya incorrectes." (no user enumeration) | ☐ |
| S-22 | F-EMP-3 B2 | R-PRIV-13 | [B] Five wrong attempts for one username, then the right password | From the sixth try: "Massa intents. Torna-ho a provar d'aquí a una estona." even with the right password. The limit is in memory, per process; restarting the server clears it | ☐ |
| S-23 | F-EMP-4 | R-PRIV-4, R-PRIV-13 | [B] `/login`, "He perdut la contrasenya", fill "Nom d'usuari", "Codi de recuperació" (dashes and case ignored), "Contrasenya nova", press "Canvia la contrasenya" | Title "Contrasenya canviada" with a **new** recovery code and the "L'he desat en un lloc segur" checkbox. The old password gives "Usuari o contrasenya incorrectes." A wrong code or unknown user gives "Usuari o codi de recuperació incorrectes." A short new password gives "La contrasenya ha de tenir almenys 8 caràcters." | ☐ |
| S-24 | F-EMP-10 step 1 | R-PRIV-13 | [B] `/settings`, panel "Canvia la contrasenya": fill "Contrasenya actual", "Contrasenya nova", "Repeteix la contrasenya nova" | Status "Contrasenya canviada." Old password no longer logs in, new one does. Errors: "La contrasenya actual no és correcta.", "La contrasenya nova ha de tenir almenys 8 caràcters.", "Les contrasenyes noves no coincideixen." | ☐ |
| S-25 | F-EMP-10 steps 3, 4 | R-PRIV-8, R-PRIV-13 | [B] Panel "Esborra el compte": "Vull esborrar el compte", then with the password "Sí, esborra el compte"; first also try "Cancel·la" | "Segur que vols esborrar-lo? Escriu la contrasenya per confirmar." "Cancel·la" deletes nothing. After confirming: redirect to `/join?compte=esborrat` with "Compte esborrat. Les respostes que vas donar es queden com a dades anònimes." The old credentials fail. [T] the `compte` row is gone and the old `resposta` rows remain (no cascade). Retention beyond this is not configurable (ABS, R-PRIV-8) | ☐ |
| S-26 | F-EMP-10 step 2, F-EMP-2 B6 | R-PRIV-4 | [B] Panel "Codi de recuperació": fill "Contrasenya actual", press "Genera un codi nou" | Screen "Codi de recuperació nou" with a code and "El codi anterior ja no funciona."; "Fet" goes to `/settings`. The old code then fails in S-23 | ☐ |
| S-27 | F-EMP-3 step 4 | R-PRIV-13 | [B] `/settings`, "Tanca la sessió" | Cookie destroyed, redirect to `/login`; `/` redirects to `/login` again | ☐ |
| S-28 | F-EMP-3 B3, F-PRIV-4 | R-PRIV-3 | [B]+[T] Log in, keep the tab, delete that account from another tab (S-25), reload the first tab | The still-valid cookie is treated as logged out: redirect to `/login`; `GET /api/pool/next` returns 401 `no_autenticat` | ☐ |
| S-29 | F-EMP-4 step 4 | R-PRIV-4 | [B] Use a recovery code once (S-23), then try the same code again | "Usuari o codi de recuperació incorrectes." A used code never works twice | ☐ |

### 3.4 Pushes

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-30 | F-EMP-9 | R-FLOW-5d, N-12 | [B] Use the employee app for a full answer cycle without touching the push button; call `Notification.permission` with `javascript_tool` | No permission prompt appears; the value stays `default`. Only the compact "Notificacions" card offers it | ☐ |
| S-31 | F-EMP-9 | R-FLOW-5d, N-12 | [P] Jan: iPhone Safari, PWA not added to the home screen, open `/settings` | Nothing breaks; "Aquest navegador no admet notificacions. A l'iPhone, afegeix l'app a la pantalla d'inici…"; no prompt | ☐ SKIP-P |
| S-32 | F-EMP-9, F-JOB-4 | R-FLOW-5d, R-PRIV-1 | [T] After M-12, log out and run `select count(*) from push_subscripcio` | The account's row is gone. No scheduled job sends anything (F-JOB-4 absent). `/hr/needs` HTML never contains an endpoint or account id | ☐ |
| S-33 | F-EMP-5, F-HR-4 | R-FLOW-4a, R-FLOW-5d | [B] With a Logística account that already answered today's batch (M-15, "Gràcies"), create a second Logística need with two questions, approve and publish it (M-4 to M-8). On the employee tab reload `/` (or click the notification, M-13) | With no extra tap, "Pregunta 1 de 2" shows the new need's two questions; nothing already answered comes back. Both answers are accepted (204), then "Gràcies". [T] the account's `assignment` rows for today gain two `reason='need'` rows after the original slots (verified 2026-11-07 on a copy of the dev DB) | ☐ |

### 3.5 Question pacing and answer API

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-40 | F-EMP-5, F-JOB-2 | R-FLOW-5c, R-TENSION-1 | [B] Fresh account, `/api/pool/next` (via `javascript_tool` fetch) and the UI | At most 3 questions in the batch (`questionsPerDay`). "Pregunta 1 de N" with N up to 3 | ☐ |
| S-41 | F-EMP-5 B6, F-JOB-2 | R-FLOW-5f | [T] `pnpm --filter @damm/db run madrid-check` | A new batch starts at 00:00 Europe/Madrid, not UTC, including both DST changes | ☐ |
| S-42 | F-JOB-2, F-HR-3 | R-FLOW-5c | [B] With an approved HR need for the collective, new account, read the batch | Order: any due follow-up, then the HR need (highest `prioritat`, one per day), then monitoring questions | ☐ |
| S-43 | F-EMP-5 B2 | R-FLOW-5a | [B] Answer one question, then replay the same `POST /api/responses` from `javascript_tool` | 409 `{ error: "already_answered", preguntaId }`; no second `resposta` row; the UI treats 409 as done | ☐ |
| S-44 | F-EMP-5 B1 | R-FLOW-5c | [B] After the last answer of the day reload `/` and `/api/pool/next` | Done screen with "Avui ja has acabat. Demà en tens de noves." or "Gràcies" and no question; `preguntes` empty | ☐ |
| S-45 | F-EMP-5 B3 | R-DATA-4 | [B]+[T] `POST /api/responses` with two items: one valid, one invalid (`valueNum` out of range) | 400 `invalid_value`; **nothing** is stored (the batch is atomic): count `resposta` rows for the account before and after | ☐ |
| S-46 | F-EMP-5 B3, B4 | R-FLOW-5a | [B] Logged in, via `fetch`: unknown id (for example 999999) | 400 `not_in_todays_batch`; an open question with no text: 400 `missing_comment`; an out-of-range value: 400 `invalid_value`; 0 items or 11 items or `comentari` over 1000 characters: 400 `peticio_invalida`; body not JSON: 400 `json_invalid`; no session: 401 `no_autenticat` (cookie cleared) | ☐ |
| S-47 | F-EMP-5, F-JOB-2 | R-TENSION-1 | [T] `source ~/.claude/bin/heavy-gate.sh` then in `packages/engine` run `pnpm test` (one heavy job, read only) | Passes; the picker prefers items not seen in the last 28 days (soft cooldown) and falls back to any item. There is **no** "same question 4 days in a row" rule: do not expect one | ☐ |
| S-48 | F-EMP-1 B1, F-EMP-5 | R-FLOW-5c | [B] Compare the `/join` lede with the batch size | `/join` says "Dues preguntes breus al dia." while the engine gives 3 a day. Record `KG` (copy mismatch, documented) | ☐ KG |

### 3.6 Answer-flow resilience

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-50 | F-EMP-6 step 1, 2 | R-FLOW-5a, R-U-1 | [B] Type a comment, set the browser offline (DevTools or a blocked request), press "Envia"; go online, press "Torna-ho a provar" | Alert "Sense connexió. La teva resposta continua aquí: torna-ho a provar quan tornis a tenir xarxa."; button "Torna-ho a provar"; text kept; then sent | ☐ |
| S-51 | F-EMP-6 step 3 | R-U-1 | [B] Reload during an unsent answer | Draft restored from `localStorage` key `damm:draft:v1:<compteId>:<questionId>`; removed after a successful send; drafts of questions not in today's pool are pruned | ☐ |
| S-52 | F-EMP-6 B | R-FLOW-5a | [B] Make `POST /api/responses` fail with 500 (stop the server briefly or intercept) | "No s'ha pogut enviar la resposta. La teva resposta continua aquí: torna-ho a provar." and the retry button works. Server unreachable while online: "No hem pogut connectar amb el servidor. …" | ☐ |
| S-53 | F-EMP-6 B | R-FLOW-5a | [B] Open `/` with the pool request failing | "No s'han pogut carregar les preguntes." with "Torna-ho a provar"; offline variant "Sembla que no tens connexió. Comprova la xarxa i torna-ho a provar." (or the offline page `public/offline.html`) | ☐ |
| S-54 | F-EMP-5 B3, B4 | R-FLOW-5a | [B] Direct API checks with `javascript_tool` (the codes are the ones in S-46: `not_in_todays_batch`, `invalid_value`, `missing_comment`, `already_answered`, `peticio_invalida`, `json_invalid`, `no_autenticat`) | The stale codes `ja_respost`, `pregunta_invalida`, `valor_invalid`, `comentari_obligatori`, `redaccio_fallida` never appear | ☐ |
| S-55 | F-EMP-6 B | R-U-1 | [B] Block `localStorage` (private window with site data blocked, or `javascript_tool` override of `Storage.prototype`), answer a question | The app still works; the draft just does not survive a reload; no crash | ☐ |

### 3.7 LLM down, slow, and HR form validation

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-60 | F-HR-2 B1 | R-FLOW-2, R-X-3 | [T]+[B] Unset `LLM_API_KEY`, restart, create a need | Drafts appear with the badge "Plantilla de reserva" and tooltip "La IA no ha estat disponible: són preguntes de plantilla" | ☐ |
| S-61 | F-HR-2 B1 | R-FLOW-2 | [T]+[B] Point `LLM_BASE_URL` at a dead host, create a need; time "Generant…" | Same fallback, no hung page; write the wait in the log | ☐ |
| S-62 | F-HR-3 | R-X-3, R-PRIV-7 | [B] In either case | Nothing is live until a person presses "Aprovar" on each question (`approveQuestion` is the only path to `aprovada`) | ☐ |
| S-63 | F-HR-2 B7 | R-FLOW-1e | [B] Create a need with the exclusion "Salaris" | No draft question touches pay; excluded topics are dropped before display (R-FLOW-1e is partial: check by reading the drafts). The quality repair loop and bias checker are not in this tree (unmerged branch; R-FLOW-3e, R-BIAS-4, N-10): ABS | ☐ |
| S-64 | F-HR-2 B2 to B4 | R-FLOW-1a | [B] Form errors: empty objective; objective under 15 characters; duration under 30 or not a number | "Escriu l'objectiu de la consulta abans de generar els esborranys." / "L'objectiu és massa curt perquè la IA el pugui treballar. Explica què vols entendre i de qui." / "La durada màxima ha de ser d'almenys 30 segons." No need row is created | ☐ |
| S-65 | F-HR-2 B6 | R-FLOW-3e | [B] Create a need with a 30 second maximum and many questions | Warning "Atenció: el temps estimat … supera la durada màxima" on the card. Conditional logic and other quality warnings are ABS (R-FLOW-2e, R-FLOW-3e) | ☐ |

### 3.8 Access, manager, PII, static pages

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-70 | F-HR-1 B1 | R-PRIV-3 | [B] With GATE-ON and no cookie, open `/hr/results`, `/hr/publish`, `/hr/needs`, `/hr/signals`, `/hr/recommendations`, `/hr/methodology`, `/hr/signals/1`, `/manager`, `/manager/Logística` | Each redirects to `/hr-login?next=<path>`; after logging in you return to that path | ☐ |
| S-71 | F-HR-1 B2, F-PRIV-4 | R-PRIV-3 | [B] Log in as an employee (cookie `damm_session`), open `/hr`; then log in as HR and check the employee side | The employee login does not unlock `/hr` (redirect to `/hr-login`); the HR login does not create an employee session. Cookies are separate | ☐ |
| S-72 | F-MGR-1, F-MGR-2 | N-8, R-PRIV-3 | [B] With the HR cookie open `/manager/Fàbriques`, `/manager/Logística`, `/manager/Comercial`, `/manager/Oficines` in turn | All four open: a manager is not bound to one collective (ABS, N-8). No 403. The data on each page is scoped to the opened collective and shows only audience `hr_manager` alarms | ☐ ABS |
| S-73 | F-HR-1 B3 | R-X-3 | [T]+[B] With `HR_ACCESS_CODE` empty, restart, open `/hr` | The gate is off and `/hr` opens directly. Restore the code afterwards; the demo `.env` must set one | ☐ |
| S-74 | F-EMP-5 B5 | R-PRIV-3, R-PRIV-1 | [B]+[T] On an open question, in separate answers (new accounts as needed) submit: "Em dic Anna Puig", "anna.puig@example.com", "600123456", "12345678Z", "ES9121000418450200051332". Read `resposta.comentari` | Stored as `[nom]`, `[correu]`, `[telèfon]`, `[DNI]`, `[compte]` (regex, best effort). The raw text is never stored; HR pages never show the original. There is no `redaccio_fallida` code. If no open question is in the batch, mark `N/A` and note it | ☐ |
| S-75 | F-HR-3 step 6, F-HR-1 | R-PRIV-10, R-X-3 | [T] `select distinct aprovada_per from pregunta where estat='aprovada'` and `select aprovada_el` for the same rows | The constant `hr-demo` and a timestamp. There are no named HR users (ABS): the approver is not a real person | ☐ KG |
| S-76 | F-EMP-7 step 2 | R-PRIV-13 | [B] `/privacitat` with no session, via the links in `/join/<code>`, `/onboarding` and `/login` ("Com tractem les teves dades"); from `/settings` the link "Llegeix com tractem les dades" | Heading "Com tractem les teves dades" with sections "Què recollim", "Què veu Recursos Humans", "Què no fem mai", "Comentaris lliures", "Sessió i compte" (verify the exact headings). Reachable without a session | ☐ |
| S-77 | F-HR-10 | R-FLOW-7, R-BIAS, R-PRIV-2 | [B] Nav "Com es calcula?" (`/hr/methodology`) | Page opens with no crash, explains confidence, precision labels, suppression and weighting in Catalan; the quoted thresholds (10 and the precision cut-offs) match the trend tables in `/hr/results` | ☐ |
| S-78 | F-HR-7 B, F-MGR-2 | R-FLOW-7 | [B] Open `/hr/signals/abc`, `/hr/signals/999999`, `/manager/Inexistent` | 404 each | ☐ |
| S-79 | F-HR-1 B4 | R-FLOW-1 | [B] Open `/hr/need` and `/hr/review` | Both redirect to `/hr/needs` | ☐ |

### 3.9 Closing the loop, alarms, jobs, absent features

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-85 | F-HR-7 | R-FLOW-7, N-2 | [B] On `/hr/signals` move one alarm through the status buttons: open, acknowledged, action_linked, resolved. Press "Recalcula ara" | The state survives a reload and shows in the 4-step timeline "Del senyal a l'acció". "Recalcula ara" does not overwrite an acknowledged or action-linked alarm (7-day cooldown stops the same alarm being re-raised). Empty list text is "Cap alarma activa." | ☐ |
| S-86 | F-JOB-1 | R-FLOW-7, N-2, N-4 | [T] Run `DB_PATH=data/demo.db pnpm --filter @damm/engine run job` twice (heavy gate) | Same counts for the same data; no error; nothing per person is written. An alarm acknowledged in S-85 stays acknowledged | ☐ |
| S-87 | F-EMP-8 | R-FLOW-8, R-U-3 | [B] As an employee of a collective without approved actions open `/`; then of one with approved actions | Without: the card "Has dit, hem fet" is always shown with "Encara no hi ha accions aprovades per al teu col·lectiu. Quan Recursos Humans en aprovi, les veuràs aquí, amb el període i quantes persones hi havia al darrere." With: only actions of the account's collective (or all-company ones), at most 20, never another collective's | ☐ |
| S-88 | F-HR-6 | R-FLOW-6, R-PRIV-1, R-PRIV-2, R-DATA-9 | [B] `javascript_tool`: `const r=await fetch('/hr/results/export'); [r.headers.get('content-disposition'), r.headers.get('cache-control'), (await r.text())]` | Filename `resultats-agregats-YYYY-MM-DD.csv`, `Cache-Control: no-store`, UTF-8 BOM (first character code 65279), header `tipus,periode,collectiu,torn,domini,respondents,resp_pct,pop_pct,diferencia_pp,mitjana,suprimit`, `#` comment lines that state the minimum group size 10. Verify the header and filename text in the browser; differences are findings | ☐ |
| S-89 | F-HR-1, F-JOB-1, F-EMP-2, F-PRIV-5 | R-PRIV-8, R-PRIV-10, N-8 | [T]+[B] Confirm absence: `curl -i -X POST http://localhost:3000/api/jobs/run`; the onboarding screen has no centre, shift or manager question; `/hr-login` has one code field and no username; no retention setting exists in `/settings` | 404 for the jobs endpoint; no extra onboarding question; one shared HR code; only delete-account exists. All ABS | ☐ ABS |

### 3.10 Layout, theme, accessibility, demo smoke

| ID | Flow | Req | Steps | Expected | Result |
|---|---|---|---|---|---|
| S-80 | F-EMP-1, F-HR-5 | R-U-1 | [B] Employee app at 375 px, HR at 1280 px and at tablet width | No horizontal scroll; tap targets comfortable; the HR nav scrolls horizontally on narrow screens | ☐ |
| S-81 | F-EMP-5, F-HR-5 | R-U-1 | [B] `resize_window` with `colorScheme` dark, then light | Both sides readable, no white flash, badges keep contrast | ☐ |
| S-82 | F-EMP-1 to F-EMP-5 | R-U-1 | [B] Keyboard only through `/join`, `/onboarding`, `/login` and one answer | Visible focus, a label for every field, Enter submits, errors are `role="alert"` | ☐ |
| S-83 | F-EMP-5 | R-U-1 | [B] Page at 200 percent zoom (or a narrow viewport) and `read_page` on the answer screen | Content reflows; each question and option has a readable name | ☐ |
| S-84 | all | all Musts | [T]+[B] Demo-day smoke test, 10 minutes, stop at the first failure: (1) note the commit, rebuild the DB, `pnpm dev`; (2) HR gate M-1 to M-3; (3) `/hr/results` shows the suppressed rows (M-18, M-19); (4) create a need, approve, publish (M-4 to M-8); (5) mobile preset: join, account, recovery code, one answer (M-10 to M-14); (6) `/hr/recommendations`, approve one, press "Crear enquesta de seguiment" (M-21, M-22); (7) `bash scripts/security-demo.sh` ends clean (S-5); (8) stop the dev server | Every step passes and the whole run takes about 10 minutes | ☐ |
| S-90 | F-JOB-3, F-HR-5, F-HR-7 | R-DATA-1 to R-DATA-9, R-BIAS, R-DIFF | [T]+[B] Planted stories on the demo DB. First `sqlite3 data/demo.db "select tipus, severity, status, audience, collectiu_id, domini_id from senyal order by id desc limit 20"`, then the pages as listed below | See the table below | ☐ |

Planted demo stories (S-90), `data/demo.db` is deterministic:

| Story | Where | Expected on screen |
|---|---|---|
| Shift changes announced late, from 1 Oct | Fàbriques, Condicions i organització | A critical `sharp_drop` alarm in "Alarmes", a "Canvi destacat" card, comments about shift changes in the themes |
| Heat and safety equipment, slow decline from mid-August | Logística, Condicions i organització | `sustained_decline` (or `feble`) alarm, comments about heat and equipment |
| Supervisor view collapses from 14 Oct | Logística morning shift, Lideratge | `changepoint_cluster` (critical, "Només RH", **not** visible in `/manager/Logística`), a "Confirmació del seguiment" card |
| Team splits, mean unchanged, from 1 Oct | Oficines, Entorn i relacions | `polarisation` alarm and the "Polarització" card |
| Managers answer more positively | everywhere | A "Diferència entre grups" card with the manager dimension |
| Few night-shift accounts | Fàbriques and Logística night | "Suprimit" rows with no values, in cards and in the CSV |

## 4. Coverage maps

### 4.1 Flow to cases

Every flow in `docs/user-flows.md` has at least one case. Cases cite the flow in their own row.

| Flow | Cases |
|---|---|
| F-EMP-1 Join | M-10, S-10 to S-14, S-16, S-17, S-48, S-80, S-82 |
| F-EMP-2 Onboarding and recovery code | M-11, S-15, S-18, S-26, S-82, S-89 |
| F-EMP-3 Log in and out | S-19 to S-22, S-27, S-28, S-82 |
| F-EMP-4 Forgot password | S-23, S-29 |
| F-EMP-5 Answer today's questions | M-14, M-15, M-24, S-40 to S-48, S-54, S-74, S-80, S-81, S-83 |
| F-EMP-6 Failure handling | S-50 to S-53, S-55 |
| F-EMP-7 Settings and privacy page | M-12, S-76 |
| F-EMP-8 "Has dit, hem fet" | M-15, M-22, S-87 |
| F-EMP-9 Push | M-12, M-13, S-30 to S-33 |
| F-EMP-10 Account management | S-24 to S-26 |
| F-HR-1 Enter the portal | M-1 to M-3, S-70, S-71, S-73, S-75, S-79, S-89 |
| F-HR-2 Need and AI drafts | M-4, M-5, S-60 to S-61, S-63 to S-65 |
| F-HR-3 Review and approve | M-6, M-7, S-42, S-62, S-75 |
| F-HR-4 Publish | M-8, M-9, S-8, S-33 |
| F-HR-5 Results | M-16, M-18 to M-20b, S-1, S-3, S-7, S-8, S-80, S-81, S-90 |
| F-HR-6 CSV export | S-2, S-4, S-88 |
| F-HR-7 Signals and recommendations | M-20, M-21, S-78, S-85, S-90 |
| F-HR-8 Follow-up survey | M-22 |
| F-HR-9 Close a need | M-24, S-14 |
| F-HR-10 Methodology | S-77 |
| F-MGR-1 Manager picks a collective | M-23, S-72 |
| F-MGR-2 Manager reads a collective | M-23, S-72, S-78 |
| F-PRIV-1 Boundary in code | S-5, S-6 |
| F-PRIV-2 No individual data | S-1, S-2, S-7 |
| F-PRIV-3 Account counts only | S-8 |
| F-PRIV-4 Session separation | S-28, S-71 |
| F-PRIV-5 Data at rest | S-6, S-89 |
| F-PRIV-6 Synthetic data only | S-9 |
| F-JOB-1 Engine job | M-17, S-86, S-89 |
| F-JOB-2 Daily batch | M-17, S-40 to S-42, S-47 |
| F-JOB-3 Seed and demo builds | S-90 |
| F-JOB-4 Daily push send (absent) | M-13, S-32 |

### 4.2 Requirement group to cases

| Requirement group | Covered by |
|---|---|
| R-FLOW-1 to 4 (need, drafts, approval, publish) | M-4 to M-9, S-60 to S-65 |
| R-FLOW-5 (answering, frequency, reminders) | M-10 to M-15, S-30 to S-33, S-40 to S-48, S-50 to S-55 |
| R-FLOW-6 to 8 (analysis, dashboard, actions) | M-16 to M-22, S-85 to S-88 |
| R-PRIV (anonymity, redaction, credentials, retention) | S-1 to S-9, S-15 to S-29, S-70 to S-76, S-89 |
| R-X-3, R-PRIV-7, R-PRIV-10 (AI proposes, human decides, approver) | M-7, M-21, S-62, S-75 |
| R-U-3, N-8 (managers) | M-23, S-72 |
| R-BIAS, R-DIFF | M-19, M-20, M-20b, S-1 to S-3, S-90 |
| R-DATA (synthetic data) | S-9, S-90 |
| R-U (usability, accessibility) | S-50 to S-55, S-80 to S-83 |

## 5. Results log template

Copy one block per run. Leave it empty in this file.

```
Run date:           YYYY-MM-DD HH:MM (Europe/Madrid)
Commit:             <git rev-parse --short HEAD>   branch: <name>
Tester:             <name or agent>
Devices:            <in-app browser preset> / <phone model, OS, browser if any>
DB:                 demo / seed        Join codes read from joincode: <list>
LLM:                live / fallback     HR gate: on / off
Build checks:       lint ☐  check:anonymity ☐  build ☐

Main scenario (P pass, F fail, KG known gap, ABS absent as expected, SKIP-P phone only, N/A)
M-1  ☐  M-2  ☐  M-3  ☐  M-4  ☐  M-5  ☐  M-6  ☐  M-7  ☐  M-8  ☐  M-9  ☐
M-10 ☐  M-11 ☐  M-12 ☐  M-13 ☐  M-14 ☐  M-15 ☐  M-16 ☐  M-17 ☐  M-18 ☐
M-19 ☐  M-20 ☐  M-20b ☐ M-21 ☐  M-22 ☐  M-23 ☐  M-24 ☐

Further scenarios (ID and result):
S-1 ☐ ... S-9 ☐ | S-10 ☐ ... S-19 ☐ | S-20 ☐ ... S-29 ☐ | S-30 ☐ S-31 ☐ S-32 ☐ S-33 ☐
S-40 ☐ ... S-48 ☐ | S-50 ☐ ... S-55 ☐ | S-60 ☐ ... S-65 ☐ | S-70 ☐ ... S-79 ☐
S-80 ☐ ... S-90 ☐

Failures (ID, what happened, screenshot or log path, owner):
-

Notes (timings, odd behaviour, ideas):
-
```

### Run 2026-11-07 (agent run, partial)

```
Run date:           2026-11-07 ~19:00-20:30 (Europe/Madrid)
Commit:             b39c355   branch: jan/e2e-run
Tester:             Claude (agent session)
Devices:            built-in browser pane, mobile 375x812 and desktop / no phone
DB:                 demo (data/demo.db)   Join codes: DEMO-FÀB, DEMO-LOG, DEMO-COM, DEMO-OFI, E2AC187B (new Logística need)
LLM:                fallback (no key; badge "Plantilla de reserva")   HR gate: on for M-1..M-3 and S-4, then OFF (HR_ACCESS_CODE emptied) for the rest of the HR browser cases, because the 12 h cookie expired and the code cannot be typed without echoing it
Build checks:       check:anonymity P (also via S-5)  lint not run  build not run
Server:             port 3001 (3000 was taken), so join links and QR show 3000; substitute 3001

Main scenario
M-1..M-8 P | M-9 P (Teams send ABS) | M-10 P (phone QR SKIP-P) | M-11 P | M-12 ABS (no push toggle)
M-13 ABS (/api/push/* return 404) | M-14 P (batch of 3, no open question served) | M-15 P
M-16 not run | M-17 P (see plan bug 1) | M-18 F (F5) | M-19 P | M-20 P (F2, F3) | M-20b P (12 "Confirmació del seguiment" cards, only skimmed)
M-21 ABS (recomanacio has 0 rows, no generate button) | M-22 ABS (needs a recommendation) | M-23 P (4 collectives 200, /manager/Inexistent 404)
M-24 P for the UI (closed without a confirm dialog); the KG that a new account still gets the closed need's questions was not re-checked

Further scenarios run
S-4 P | S-5 P | S-6(d) P | S-9 P | S-12 P | S-13 P | S-17 P | S-43 P | S-44 P | S-46 partial P (unknown id, 0/11 items, long comment, non-JSON all rejected;
invalid_value and missing_comment not tried) | S-74 N/A (no open question was served) | S-30 inconclusive (Notification.permission is "denied" in the pane)
Not run (time and memory budget): every other S-case, including S-1..S-3, S-6 (c, e), S-7, S-8, S-10, S-11, S-14..S-16, S-18..S-29, S-31, S-32, S-40..S-42, S-45, S-47, S-48,
S-50..S-55, S-60..S-65, S-70..S-73, S-75..S-90. Engine `pnpm test` and lint/build were not run either.

Failures (ID, URL, observed vs docs/user-flows.md, guessed file), ranked by demo impact:
F1 HIGH  M-14/M-17/M-20. One live answer in a new month blanks the dashboard. My answer created period 2026-11; the 10-minute job wrote 66 all-suppressed
         agregat rows and 78 insight rows for 2026-11 (1 respondent). /hr/results (latest period = 2026-11) then showed everything "Suprimit" with 0 themes, HR home
         "Participació" showed "—", and 23 of 24 senyal rows got suprimit=1, so /hr/signals went empty. There is no period selector (only ?vs=). Deleting the answers
         did not restore it, because the job never prunes stale agregat/insight rows (I had to delete them by hand and rerun). Expected: a month with n < 10 must not
         become the "current" period for the dashboard and alarms. Files: packages/db/src/hr-repository.ts (latest period = MAX(periode) FROM agregat, also in
         getRepresentativeness), packages/engine/src/alarms.ts (current at ~293, apply() ~359-380), packages/engine/src/job.ts, apps/web/app/hr/results/page.tsx.
         Demo risk: the first live answer on stage in a new month, or after the demo DB date rolls over.
F5 HIGH  M-18. /hr/results, section "Representativitat" (by collective and by shift) is entirely "Suprimit · Menys de 10 respondents", and "Temes dels comentaris" says
         "Encara no hi ha temes" (Temes detectats 0), on the 2026-10 baseline. Cause: getRepresentativeness (packages/db/src/hr-repository.ts:508) reads agregat rows with
         domini_id NULL and collectiu_id NOT NULL; the demo DB has none (checked on a backup taken before my changes too), the engine job only writes per-domain rows, and
         packages/analysis does not exist. tema and comentari_tema have 0 rows (theme job absent, see section 6 item 3). Expected: R-FLOW-7 representativity vs the
         synthetic population visible. Fix idea: write collective and shift totals in the job (or compute them in the HR repository from the analytics view).
F2 MED   M-20. /hr/signals/1 shows "confiança 8011%" and /hr/signals/3 "confiança 6311%": confidence is multiplied by 100 twice. File: apps/web/app/hr/signals/[id]/page.tsx.
F3 MINOR M-20. Alarm descriptions are English inside the Catalan UI ("Score fell 1.2 points (5.8 → 4.6) since the previous period.", "Confidence is low (35/100)...")
         and the numbers (5.8, 4.6) are on a 0-10 score scale while the radar and trends use the 1-5 mean (about 3.x), which looks contradictory. File: packages/engine/src/alarms.ts.
F6 MINOR M-18. Trends show n=344 and identical means in all three periods for five of six domains (for example 3.4, 3.4, 3.4), so the planted October theme and the "up/down"
         labels never appear ("sense canvi clar" everywhere); on /manager/<collectiu> the radar point labels read "<collectiu> · 2026-09" for what looks like both series. Files: seed/demo generator, apps/web/app/manager.
F7 MINOR M-24. "Tanca la necessitat" closes at once with no confirm dialog (irreversible-looking action). File: apps/web/app/hr/needs.
Minor copy: M-11 heading "Crea el teu compte" stays above "Compte creat"; M-12 delete-account text mentions "la subscripció a les notificacions" although there is no push toggle;
the need's join-code card shows no account count; `/join` says "Dues preguntes" (known S-48).

Notes:
- Plan bug 1: the M-17 command `DB_PATH=data/demo.db pnpm --filter @damm/engine run job` fails with "unable to open database file", because the relative path is resolved from
  packages/engine. Use `DB_PATH=$PWD/data/demo.db`.
- Plan bug 2: the plan says "Copia" where the app says "Còpia".
- Plan note: `.env` does not exist in a fresh worktree; generate it from .env.example (HR_ACCESS_CODE and the session secret). session.ts has a dev-only fallback secret string.
- Login throttle (5 per 15 min per username and IP) is in memory and is cleared by a restart.
- Run-order lesson: run M-17/M-18 before any live answer, or reset 2026-11 rows afterwards (see F1).
- State left behind: demo.db has a test account `usuari.prova`, a closed Logística need (join code E2AC187B) and alarm 3 set to "Resolta".
```

## 6. Findings while writing this plan

None of these has been fixed here.

1. `goToJoinAction` (`apps/web/app/join/actions.ts`) does not add a missing hyphen: `dammfab` goes to `/join/DAMMFAB` and shows "Codi no vàlid". See S-10.
2. `closeNecessitat` only sets `necessitat.estat = 'tancada'`; the engine's `approvedQuestionsFor` ignores it, so a closed need's questions are still served. See M-24 (F-HR-9 B1).
3. There is no `POST /api/jobs/run` and no comment-theme clustering job in the tree. The engine job covers scores, insights and alarms. See S-89.
4. `PUBLIC_BASE_URL` is used by the code and the docs but is missing from `.env.example`.
5. `/join` says "Dues preguntes breus al dia" while the engine default is 3 a day. See S-48.
6. Stale statements in other docs (listed in `docs/user-flows.md` section 8): `docs/requirements.md` says the approver is not recorded (it is the constant `hr-demo`); `docs/employee-pwa-spec.md` says the join code travels in the session (it travels in `?codi=`) and lists "Res més per avui" and a push toggle that do not exist; `docs/demo-script.md` still uses older labels (for example the separate "Esborranys pendents" list; the needs page is `/hr/needs` since commit `0373ce2`).
7. No helper exists to add many synthetic answers for a newly published need; reaching n of 10 for a fresh need takes ten manual accounts. See M-16.
