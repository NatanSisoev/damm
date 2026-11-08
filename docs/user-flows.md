# User flows

Expected paths through the product, written so the e2e runbook (`docs/e2e-test-plan.md`) can be reworked into sharper tests. Scope comes from `docs/requirements.md`. Written 2026-11-07 against the code on `jan/dev`; corrected the same day against `jan/dev` at 6474268 (engine wired into the routes, account management built, insight cards and the Alarmes page built). Employee, HR and manager routes read from `apps/web/app`, rules read from `packages/db/src` and `packages/engine/src`.

How to read this:

- A flow has an ID, the requirement IDs it covers, preconditions, numbered steps (route, action, exact expected result), branches and invariants.
- UI text is the real Catalan copy from the code. DB effects name the table and column.
- **Current** means what the code does today. **Target** means what the docs promise and the code does not do yet. **Expected gap** means the feature is not built: a test must expect its absence, not its behaviour.
- Nothing here is invented. Where the docs and the code disagree, both are named and the flow follows the code.

## 0. Preconditions used by the flows

| Tag | Meaning |
|---|---|
| **DB-seed** | Dev DB from `pnpm --filter @damm/seed run seed` (`data/app.db`). About 1,200 synthetic employees, about 700 responses, about 500 comments. Join codes `DAMM-FAB`, `DAMM-LOG`, `DAMM-COM`, `DAMM-OFI`. Logística/nit has 6 accounts by design (below 10). |
| **DB-demo** | `DB_PATH=data/demo.db`, built by `pnpm --filter @damm/engine run demo` (about 4 min). Three months of synthetic answers, planted alarms and insights (stories S-90). Join codes are `DEMO-<first three letters of the collective>` (the deployed DB has `DEMO-FAB`: accents are stripped at startup); read the real values from the `joincode` table before testing. |
| **GATE-ON** | `HR_ACCESS_CODE` is set in `.env`. `/hr`, `/manager` and their subpaths redirect to `/hr-login?next=<path>` without the cookie `hr_access`. |
| **GATE-OFF** | `HR_ACCESS_CODE` is empty. The gate is off and `/hr` opens directly. |
| **LLM-ON** | `LLM_API_KEY` and `LLM_BASE_URL` set. Model `ornith`. |
| **LLM-OFF** | No key or a dead host. Drafting falls back to templates. |
| **EMP-OUT** | No `damm_session` cookie. |
| **EMP-IN** | Valid `damm_session` cookie (HMAC signed, 30 days) and the account row still exists. |

Time: "today" for the employee flow is the Europe/Madrid calendar day (`madridDay`). `resposta.data` is stored in UTC. The current date at writing is 2026-11-07.

Wiring status: the engine package (`@damm/engine`) **is wired into the routes**. `apps/web/lib/engine.ts` builds one engine (`createEngine({db, redact})`); `GET /api/pool/next` calls the engine's `getDailyBatch` (which adds published-need questions on top, C18) and `POST /api/responses` calls `submitAnswers`. A scheduler runs the engine job every 10 minutes (`instrumentation.ts`). The old stub in `packages/db/src/employee-repository.ts` is no longer on the answer path. Flows below describe the engine behaviour as **Current**. Known mismatches between docs and code are called out where they occur (batch size is 3 per day by default while the app copy says "Dues preguntes"; a closed need still serves its questions, F-HR-9 B1).

## 1. Personas

| Persona | Who | Surface | Sees |
|---|---|---|---|
| **Employee** | Anonymous person in one of four collectives (Fàbriques, Logística, Comercial, Oficines). | Mobile PWA: `/`, `/join`, `/join/[codi]`, `/onboarding`, `/login`, `/settings`, `/privacitat`. | Own questions, own "Has dit, hem fet" list. Nothing about anyone else. |
| **HR** | Person in the people team. One shared access code, no named users. | `/hr-login`, `/hr`, `/hr/needs`, `/hr/publish`, `/hr/results`, `/hr/recommendations`, `/hr/signals/[id]`, `/hr/methodology`. | Aggregates only, with suppression below 10. Never `compte_id`, usernames or single answers. |
| **Manager** | Responsable of a collective. Not a role in the DB (a flag only, not yet used). | `/manager`, `/manager/[collectiu]`. Behind the same HR gate. | Read-only aggregates for one collective at a time, plus approved recommendations. |
| **Anonymity viewpoint** | Reviewer or judge checking the exclusion criteria. | `scripts/security-demo.sh`, `pnpm check:anonymity`, `pnpm lint`, CSV export, view `v_resposta_analitica`. | Proof that the boundary is enforced in code. |
| **Jobs and engine** | No human. | `runEngineJob`, `pnpm --filter @damm/engine run job`, demo build, seed. | Writes aggregates, insights, alarms. The one reader of per-account history. |

## 2. Employee flows

### F-EMP-1 Join by link, QR or typed code

Covers: R-FLOW-5b, R-FLOW-4c, R-PRIV-13, R-CH-1.
Preconditions: DB-seed or DB-demo, EMP-OUT, an active `joincode` row.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/join/DAMM-LOG` (link or QR from the publish page). | Eyebrow = company (from `joincode.empresa`), title "Et donem la benvinguda", lede "Les teves respostes a {empresa} són anònimes i només es mostren agregades." A "Col·lectiu" card shows Logística. Privacy note "Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més." A link "Com tractem les teves dades" goes to `/privacitat`. Button-link "Continua". |
| 2 | Press "Continua". | URL becomes `/onboarding?codi=DAMM-LOG`. The code travels in the query, not in the session (the spec says session; the code differs). |

Branches:

- **B1 typed entry.** Open `/join`: title "Escoltem la teva veu", lede "Dues preguntes breus al dia. Sense nom ni correu.", field "Codi d'invitació" (placeholder `DAMM-XXX`, hint "Està al cartell o al missatge del teu equip. Si tens el QR, escaneja'l directament."), button "Entra", the same privacy note as step 1. `goToJoinAction` trims, uppercases, turns spaces and underscores into `-` and drops anything outside `A-Z0-9-`. ` damm fab ` and `damm_fab` both give `/join/DAMM-FAB`.
- **B2 missing hyphen.** `dammfab` goes to `/join/DAMMFAB` and shows "Codi no vàlid". The form does not insert the hyphen. This is a known finding, not a bug in the test.
- **B3 empty field.** Submit with nothing: redirected back to `/join`.
- **B4 lowercase URL.** `/join/damm-fab` works (code uppercased).
- **B5 wrong code.** `/join/XXXX`: "Codi no vàlid", text "Aquest codi no existeix o ja no està actiu. Comprova l'enllaç o demana un codi nou al teu equip.", link "Torna a provar amb un altre codi" to `/join`.
- **B6 inactive code.** `joincode.actiu = 0`: same screen as B5.
- **B7 direct onboarding with a bad code.** `/onboarding?codi=NOPE` shows "Codi no vàlid" with link "Escriu un altre codi".

Invariants: the page shows company and collective only. No personal field. A join code identifies one collective, never a person.

### F-EMP-2 Onboarding and recovery code

Covers: R-PRIV-4, R-PRIV-13, R-FLOW-5b, R-DATA-5.
Preconditions: F-EMP-1 reached step 2 with a valid code.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/onboarding?codi=DAMM-LOG` | Eyebrow "{empresa} · Logística", title "Crea el teu compte", intro "Tria un nom d'usuari i una contrasenya. No et demanem correu, telèfon ni nom: les teves respostes són anònimes." Fields "Nom d'usuari" (hint "No facis servir el teu nom real."), "Contrasenya" (hint "Mínim 8 caràcters (n/8 ✓)."), "Repeteix la contrasenya"; the password toggle reads "Mostra" / "Amaga". Button "Crea el compte". Link "Ja tens compte? Entra". No centre, shift or manager question (expected gap vs the spec: R-DOM-5, N-8). |
| 2 | Fill `usuari.prova`, a password of 8+ characters twice, press "Crea el compte". | A session cookie `damm_session` is set. The screen shows the title "Compte creat" and a one-time recovery code (groups of 4 characters, alphabet without 0/O/1/I/L) with the text "Desa'l ara. Aquest codi només el veuràs una vegada." Button "Copia el codi" (status "Copiat." or "No s'ha pogut copiar: selecciona'l i copia'l a mà."). Checkbox "L'he desat en un lloc segur". The continue button is disabled. |
| 3 | Tick "L'he desat en un lloc segur", press the continue button. | Redirect to `/`. |

DB effect after step 2: one `compte` row with `id` = random UUID, `collectiu_id` = Logística, `username` = `usuari.prova`, `password_hash`, `salt`, `recovery_hash` all hex scrypt. No email, phone or name column. The recovery code itself is not stored.

Branches (exact errors):

- **B1** repeat differs: "Les contrasenyes no coincideixen."
- **B2** username not matching `^[a-z0-9._-]{3,30}$` after trim and lowercase (2 characters, spaces, accents): "El nom d'usuari té entre 3 i 30 caràcters: lletres minúscules, xifres, punt, guió o guió baix." Capitals are lowercased first, so `Prova` is accepted as `prova`.
- **B3** password under 8: "La contrasenya ha de tenir almenys 8 caràcters."
- **B4** username taken: "Aquest nom d'usuari ja existeix. Prova'n un altre." (SQLite unique constraint.)
- **B5** code became inactive between pages: "Aquest codi no és vàlid o ja no està actiu."
- **B6** reload of the recovery screen after leaving: the code is not shown again (it is only returned once). A new code can be generated from `/settings` ("Codi de recuperació" → "Genera un codi nou", F-EMP-10); the old code stops working.

Invariants: `compte.id` is not derived from username or code. Password and recovery code are salted-hashed. HR cannot read `compte`.

### F-EMP-3 Log in and log out

Covers: R-PRIV-13, R-FLOW-5a.
Preconditions: an account exists, EMP-OUT.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/` | Redirect to `/login`. |
| 2 | `/login` | Title "Torna a entrar", lede "Continua on ho vas deixar.", fields "Nom d'usuari" and "Contrasenya", button "Entra", button "He perdut la contrasenya", line "Primera vegada? Obre l'enllaç d'invitació del teu equip.", link "Com tractem les teves dades". |
| 3 | Enter correct credentials, "Entra". | Redirect to `/`, cookie set, today's questions load (F-EMP-5). |
| 4 | `/settings` → "Tanca la sessió". | Push subscription row for the account deleted, cookie destroyed, redirect to `/login`. `/` redirects to `/login` again. |

Branches:

- **B1** wrong password or unknown username: same text "Usuari o contrasenya incorrectes." (no user enumeration; the unknown-user path burns comparable hash time).
- **B2** rate limit: 5 failed attempts per username in 15 minutes. From the sixth try, even with the right password: "Has fet massa intents. Torna-ho a provar d'aquí a una estona." In memory, per process, so a server restart resets it.
- **B3** deleted account with a still-valid cookie: `getCompteId()` also checks `compteExists`, so the session is treated as invalid and the user goes to `/login`.
- **B4** username case: `USUARI.PROVA` matches `usuari.prova` (lowercased).

Invariants: the account comes from the cookie only, never from a request parameter. An employee login does not unlock `/hr` (separate cookie).

### F-EMP-4 Forgot password (one-time recovery code)

Covers: R-PRIV-4, R-PRIV-13.
Preconditions: account exists, recovery code known.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/login` → "He perdut la contrasenya". | h2 "Recupera el compte" with the text "Escriu el teu usuari, el codi de recuperació que vas desar i una contrasenya nova. El codi només serveix una vegada; te'n donarem un de nou." Fields "Nom d'usuari", "Codi de recuperació", "Contrasenya nova", button "Canvia la contrasenya". Button "Torna a l'inici de sessió". |
| 2 | Enter username, code (dashes and case ignored), a new password of 8+. | Password changes, the user is logged in, title "Contrasenya canviada" with a **new** recovery code and the "L'he desat en un lloc segur" checkbox. |
| 3 | Try the old password. | "Usuari o contrasenya incorrectes." |
| 4 | Try the **old** recovery code again. | "Usuari o codi de recuperació incorrectes." (compare-and-set on `recovery_hash`: a used code never works twice.) |

Branches: wrong code or unknown user gives the same message "Usuari o codi de recuperació incorrectes." Short new password gives "La contrasenya ha de tenir almenys 8 caràcters." Recovery attempts share the 5 per 15 minutes limiter with login ("Has fet massa intents…").

### F-EMP-5 Answer today's questions

Covers: R-FLOW-5a, R-FLOW-5c, R-FLOW-5f, R-TENSION-1, R-DATA-2 to R-DATA-6, R-U-1.
Preconditions: EMP-IN, DB-seed or DB-demo, approved questions visible to the account's collective.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/` | While loading: "Carregant les preguntes d'avui…" (screen-reader text over a skeleton). `GET /api/pool/next` returns `{ preguntes: [...] }` with `Cache-Control: no-store`. |
| 2 | First question shows | "Pregunta 1 de N", a badge "Anònim", a progress bar, the renderer for the type (`scale5`, `scale10`, `yes_no`, `pair`, `choice`, `ranking`, `open`; swipe for pair). Submit button disabled until the draft is answerable. |
| 3 | Answer and press "Envia i continua" (last question: "Envia") | Button reads "Enviant…". `POST /api/responses` returns 204. Next question appears. |
| 4 | After the last answer | h2 "Gràcies", lede "Has respost la pregunta d'avui. Demà en tens de noves." (one question) or "Has respost les {n} preguntes d'avui. Demà en tens de noves." (n questions), note "🔒 Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més." Below it the "Has dit, hem fet" card (F-EMP-8). |

DB effect per answer: one `resposta` row with `compte_id`, `pregunta_id`, `valor_num` (scale 1–5 for `scale5`, 0–10 for `scale10`, 0–1 for `yes_no`, option index for `pair`/`choice`), `value_json` (ranking order, best first), `comentari` (open only, redacted), `canal = 'app'`, `periode` = server month `YYYY-MM`, `answer_ms`, `data` UTC.

**Current (engine wired):**

- `GET /api/pool/next` calls `getEngine().getDailyBatch(compteId)` (`apps/web/lib/engine.ts`) and returns `{ preguntes: [{ id, dominiId, text, tipus, options }] }`. The engine's batch for a Madrid day is fixed once built (rows in the `assignment` table, inserted with `INSERT OR IGNORE`): reloading or opening a second tab gives the same questions.
- **Published needs go past the daily cap.** On every call, `getDailyBatch` (`@damm/engine`, C18) appends every approved question of a `publicada` need for the account's collective that the account never answered and is not already in today's batch, as extra `reason='need'` rows. So an employee who logs in or taps the push after a publish sees that need's questions on `/` straight away, even after answering the day's 3; nothing already answered repeats. `submitAnswers` accepts them because they are today's rows.
- Order of the batch: one due follow-up, then one approved HR need (`prioritat` descending, `maxNeedsPerDay` = 1), then monitoring questions (domains drawn in proportion to their priority with a boost for outliers, one item per domain, facet rotation, Thompson-sampled format).
- **Batch size is 3 per day by default** (`questionsPerDay` in `packages/engine/src/config.ts`, overridable via `engine_config.questions_per_day`; no override in the seed or demo). The app copy still says "Dues preguntes breus al dia" on `/join`: a doc and UI mismatch, not a test failure of the engine.
- **No strict "same question 4 days in a row" rule.** There is a soft cooldown of 28 days per item (`itemCooldownDays`): the picker prefers items not seen in the last 28 days and falls back to any item so a slot is never left empty. An HR need's questions are asked once per person (an already-answered question is not offered again).
- The pool only holds questions with `pregunta.estat = 'aprovada'` and `collectiu_id` NULL or equal to the account's collective. It does **not** look at `necessitat.estat`, so questions of a closed need are still served to people who have not answered them (F-HR-9 B1, confirmed gap).
- `POST /api/responses` calls `submitAnswers`. Body `{ respostes: [{ preguntaId, valueNum?, valueJson?, comentari? }], canal? }`: 1 to 10 items, `comentari` up to 1000 characters, `valueJson` up to 20 entries, `canal` `app` or `mobil_qr`. Success is 204 with no body. Rejections carry `{ error: <reason>, preguntaId }`: `not_in_todays_batch` 400, `invalid_value` 400, `missing_comment` 400, `already_answered` 409. Other errors: `json_invalid` 400, `peticio_invalida` 400, `no_autenticat` 401.

Branches:

- **B1 empty pool** (no approved question for the collective, or everything already answered): the done screen at once with lede "Avui ja has acabat. Demà en tens de noves." and no question.
- **B2 repeat answer** (second tab, or replaying the POST): `POST` returns 409 `already_answered` with the `preguntaId`; the UI treats 409 as done and moves on. No second row.
- **B3 invalid payload via API** (logged in): 400 `not_in_todays_batch` (unknown, not approved, other collective's question, or a valid question not in today's batch), 400 `invalid_value` (out of range, wrong type, bad ranking permutation), 400 `missing_comment` (open question without text), 400 `peticio_invalida` (zod shape: 0 or more than 10 items, comentari over 1000), 400 `json_invalid` (body not JSON). The batch is atomic by contract: a request with one bad item must store nothing (check the DB after a mixed batch).
- **B4 not logged in:** `GET /api/pool/next` and `POST /api/responses` return 401 `no_autenticat`; the UI goes to `/login`.
- **B5 open question with PII:** a comment with a name ("Em dic Anna Puig"), an email, a phone (9 to 15 digits), a DNI/NIE or an IBAN is stored with `[nom]`, `[correu]`, `[telèfon]`, `[DNI]`, `[compte]`. The engine requires a `redact` function (`redactPii`) and never stores raw text; no `redaccio_fallida` code exists in the current code (the old statement is stale). Redaction is regex, best effort. The open question shows the note "Anònim. No hi posis dades personals (noms, telèfons, correus)."
- **B6 Madrid day rollover:** a new batch starts at 00:00 Europe/Madrid, not UTC, including both DST changes. Check with `pnpm --filter @damm/db run madrid-check`.
- **B7 careless answers:** `answer_ms` stored for non-open questions (R-BIAS, C1 data only; no UI use).

Invariants: the response is tied to `compte_id` only in `resposta`; HR code never reads that table (F-PRIV-1).

### F-EMP-6 Answer flow when the network or server fails

Covers: R-FLOW-5a, R-U-1.
Preconditions: EMP-IN, a question on screen.

| # | Action | Expected result |
|---|---|---|
| 1 | Type a comment, set the browser offline, press "Envia". | Alert: "Sense connexió. La teva resposta continua aquí: torna-ho a provar quan tornis a tenir connexió." Button now says "Torna-ho a provar". Text is kept. |
| 2 | Go online, press "Torna-ho a provar". | Sent, next question or the done card. |
| 3 | Reload before sending. | The draft is restored from `localStorage` key `damm:draft:v1:<compteId>:<questionId>`. After a successful send the key is removed. Drafts of questions not in today's pool are pruned. |

Branches: server 5xx on POST gives "No s'ha pogut enviar la resposta. La teva resposta continua aquí: torna-ho a provar." Server unreachable while online: "No hem pogut connectar amb el servidor. …". Pool load fails: "No s'han pogut carregar les preguntes." with button "Torna-ho a provar"; offline variant: "Sembla que no tens connexió. Comprova la connexió i torna-ho a provar." Blocked `localStorage`: the app still works, the draft just does not survive a reload.

Invariant: the draft lives on the device only and is never sent before the person presses send.

### F-EMP-7 Settings and privacy page

Covers: R-PRIV-3, R-PRIV-13, R-U-2.
Preconditions: EMP-IN.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/settings` | h1 "Configuració", subtitle "Les teves respostes són anònimes i només es mostren agregades, en grups de 10 persones o més." In order: card "Privadesa" with link "Llegeix com tractem les dades"; panel "Canvia la contrasenya"; panel "Codi de recuperació"; card "Sessió" with button "Tanca la sessió"; panel "Esborra el compte" (details in F-EMP-10). |
| 2 | Follow the privacy link or `/privacitat` | Heading "Com tractem les teves dades" with sections "Què recollim", "Què veu Recursos Humans", "Què no fem mai", "Comentaris lliures", "Sessió i compte" (verify the exact headings in the browser). Reachable without a session from `/join/[codi]`, `/onboarding` and `/login` (link "Com tractem les teves dades"). |

Push toggle: see F-EMP-9. Retention beyond account deletion (R-PRIV-8) is not built.

### F-EMP-8 "Has dit, hem fet" (closing the loop for the employee)

Covers: R-FLOW-8, R-FLOW-6 (loop), R-U-3.
Preconditions: EMP-IN, at least one `recomanacio` with `estat = 'aprovada'` for the account's collective (DB-demo or after F-HR-7).

| # | Action | Expected result |
|---|---|---|
| 1 | Open `/` | Below the answer flow a card with h2 "Has dit, hem fet" lists approved actions for the collective only (`approvedActionsForCompte`: `recomanacio.estat = 'aprovada'`, signal not suppressed, `n >= 10`, collective NULL or the account's, at most 20). Each item shows the action text, a badge with the period, "a partir de les respostes de {n} persones", and, while the follow-up need is published, the badge "Enquesta de seguiment en marxa". |

Branches: with no approved action the card is **always rendered** with the text "Encara no hi ha accions aprovades per al teu col·lectiu. Quan Recursos Humans en aprovi, les veuràs aquí, amb el període i quantes persones hi havia al darrere." An action for another collective is never shown. Text is the recommendation text, aggregate context only.

### F-EMP-9 Push notifications

Covers: R-FLOW-5d, N-12, R-CH-5.
Status: **built for publish**, no daily reminder. Needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `.env`; without them `/settings` shows "Les notificacions no estan activades en aquest servidor." and the home nudge is hidden.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/settings`, card "Notificacions" | Text "Activa-les i t'avisarem quan hi hagi preguntes noves. No veiem qui les rep.", button "Activa les notificacions". No permission prompt before the tap. |
| 2 | Press "Activa les notificacions", allow | Browser permission prompt, then text "Rebràs un avís en aquest dispositiu…" and button "Desactiva les notificacions". One `push_subscripcio` row keyed by `compte_id` (upsert, one per account). |
| 3 | `/` with notifications off | A compact "Notificacions" card under the answer flow with the same button; hidden once on, denied or unsupported. |
| 4 | HR publishes a need for the account's collective (F-HR-4) | Notification "Escolta activa" / "Tens preguntes noves. Només et prendrà un minut." (no question text). Tapping it focuses or opens the app at `/`. |
| 5 | "Desactiva les notificacions" | Browser unsubscribes, row deleted. |

Branches: permission denied shows "Has bloquejat les notificacions…"; a browser without push (iPhone Safari outside the home screen) shows "Aquest navegador no admet notificacions. A l'iPhone, afegeix l'app a la pantalla d'inici i obre-la des d'allà." The row is deleted on logout and account deletion and when the push service answers 404/410. Never joined to analytics. A real phone needs public HTTPS (tunnel).

### F-EMP-10 Account management

Covers: R-PRIV-8, R-PRIV-13.
Preconditions: EMP-IN, on `/settings`.

| # | Action | Expected result |
|---|---|---|
| 1 | Panel "Canvia la contrasenya": fill "Contrasenya actual", "Contrasenya nova", "Repeteix la contrasenya nova", press "Canvia la contrasenya". | role=status "Contrasenya canviada." The old password no longer logs in; the new one does. |
| 2 | Panel "Codi de recuperació" (text "Si has perdut el codi que et vam donar, en pots generar un de nou. El vell deixarà de servir i el nou només el veuràs una vegada."): fill "Contrasenya actual", press "Genera un codi nou". | Screen "Codi de recuperació nou" with a code and the note "El codi anterior ja no funciona."; button "Fet" goes to `/settings`. The old code fails in F-EMP-4 with "Usuari o codi de recuperació incorrectes." |
| 3 | Panel "Esborra el compte": press "Vull esborrar el compte". | Confirmation "Segur que vols esborrar-lo? Escriu la contrasenya per confirmar." with buttons "Sí, esborra el compte" and "Cancel·la". |
| 4 | Enter the password, press "Sí, esborra el compte". | Account and push subscription rows removed, cookie destroyed, redirect to `/join?compte=esborrat` with role=status "Compte esborrat. Les respostes que vas donar es conserven com a dades anònimes." Past `resposta` rows stay (`compte_id` has no cascade) and cannot be traced to a person. Logging in with the old credentials fails. |

Branches (exact errors in the panels): wrong current password "La contrasenya actual no és correcta."; new password under 8 "La contrasenya nova ha de tenir almenys 8 caràcters."; mismatch "Les contrasenyes noves no coincideixen."; rate limit "Has fet massa intents. Espera uns minuts i torna-ho a provar." "Cancel·la" returns to the closed panel and deletes nothing. A deleted account with a still-valid cookie is treated as logged out (F-EMP-3 B3).

Expected gap: retention of old responses is not configurable (R-PRIV-8 is only the delete-account behaviour above).

## 3. HR flows

### F-HR-1 Enter the HR portal

Covers: R-X-3, R-PRIV-3, R-PRIV-9.
Preconditions: GATE-ON.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/hr` with no cookie | Redirect to `/hr-login?next=/hr`. Page "Accés de Recursos Humans", "Accés restringit a l'equip de persones. Escriu el codi d'accés de la demo.", field "Codi d'accés", button "Entra". |
| 2 | Wrong code, "Entra" | Stays on the page with the alert "Codi incorrecte." No cookie. |
| 3 | Right code, "Entra" | Cookie `hr_access` set, redirect to the `next` path (`/hr` here). Nav: "Inici", "Necessitats", "Enllaços i QR", "Resultats", "Alarmes" (with a count badge), "Recomanacions", "Com es calcula?", "Vista de responsables". |

Branches:

- **B1** every gated path redirects with its own `next`: `/hr/results`, `/hr/publish`, `/hr/needs`, `/hr/signals`, `/hr/recommendations`, `/hr/methodology`, `/hr/signals/<id>`, `/manager`, `/manager/<collective>`, and `/hr/results/export` (no CSV without the cookie).
- **B2** an employee login does not unlock HR.
- **B3** GATE-OFF: `/hr` opens directly. The demo `.env` must set a code.
- **B4** `/hr/need` and `/hr/review` redirect to `/hr/needs`.

Expected gap: no named HR users and no per-person audit (one shared code). The approver is stored as the constant `hr-demo` in `pregunta.aprovada_per` (the requirements file says "not recorded"; it is recorded, but not as a real person: R-PRIV-10, R-X-3).

### F-HR-2 Create a need and get AI drafts

Covers: R-FLOW-1a to 1e, R-FLOW-2a to 2d, R-FLOW-2g, R-X-3.
Preconditions: GATE-ON and logged in, LLM-ON (LLM-OFF is branch B1).

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/hr/needs` → open "Nova necessitat". Optionally press an example (for instance "B · Logística des del mòbil"). | Fields "Objectiu", "Context", "Què no s'ha de preguntar", "Col·lectiu" (all or one), "Durada màxima per persona (segons)". |
| 2 | Fill an objective of 15+ characters, a duration of 30+ seconds, press "Genera els esborranys". | Button "Generant…" and text "La IA està redactant les preguntes…". |
| 3 | Wait | Redirect to `/hr/needs`. A card in state "Esborrany" with badge "Proposta de la IA" appears. |

DB effect: one `necessitat` row (`estat = 'oberta'`, `text_nl`, `collectiu_id` or NULL, `durada_max_s`, `context`, `exclusions`) and its `pregunta` rows with `estat = 'draft'`, `generada_per_ia` = 1, ordered by `ordre`. Nothing is `aprovada`. The need row is written only after drafting succeeds, so a failure leaves no orphan.

Branches (exact errors, in the form):

- **B1 LLM down or no key:** drafts still appear, badge "Plantilla de reserva" with tooltip "La IA no ha estat disponible: són preguntes de plantilla". No hung page; time how long "Generant…" lasts (dead host).
- **B2 empty objective:** "Escriu l'objectiu de la consulta abans de generar els esborranys."
- **B3 objective under 15 characters:** "L'objectiu és massa curt perquè la IA el pugui treballar. Explica què vols entendre i de qui."
- **B4 duration under 30 or not a number:** "La durada màxima ha de ser d'almenys 30 segons."
- **B5 AI and DB both fail:** "No s'han pogut generar els esborranys (la IA o la base de dades no han respost). No s'ha desat res: torna-ho a provar."
- **B6 estimated time above the maximum:** warning "Atenció: el temps estimat … supera la durada màxima" on the card.
- **B7 exclusions** (for instance "Salaris"): questions touching an excluded topic are dropped before display (R-FLOW-1e is partial; check by reading the drafts).

Expected gaps: conditional logic between questions (R-FLOW-2e), automatic quality warnings beyond duration (R-FLOW-3e), richer context fields (R-FLOW-1c, partial).

Invariants: AI proposes, nothing is live. The LLM is called here, never in a results or dashboard request.

### F-HR-3 Review and approve drafts

Covers: R-FLOW-3a to 3d, R-FLOW-2f, R-X-3, R-PRIV-10.
Preconditions: F-HR-2 done, a need in "Esborrany".

| # | Action | Expected result |
|---|---|---|
| 1 | Edit a question text, press "Desa el text" | `pregunta.text` updated (draft rows only). |
| 2 | Move a question with the up or down control | `ordre` swaps with its neighbour. |
| 3 | Press "Torna a generar" on a question | The AI (or template) replaces that draft; badge reflects its source. |
| 4 | Press "Descarta" on a question | `pregunta.estat = 'retirada'`. Gone from the draft list. |
| 5 | Edit title and introduction, press "Desa el títol i la introducció" | `necessitat` header updated; empty title is ignored. |
| 6 | Press "Aprova" on each remaining question | Each moves to "Preguntes aprovades". `pregunta.estat = 'aprovada'`, `prioritat = 100` (when tied to a need), `aprovada_per = 'hr-demo'`, `aprovada_el` set. When no draft is left and at least one is approved, the need card shows "Llesta per publicar". |

Branches: approving or editing a question that is no longer `draft` does nothing (SQL guards on `estat = 'draft'`). Discarding every question leaves the need in "Esborrany" with no approved question, so "Publica i envia la notificació" must not appear (verify). `approveQuestion` is the only code path that sets `estat = 'aprovada'`.

Invariant: AI proposes, a human decides. Nothing reaches the pool before step 6.

### F-HR-4 Publish and notify by push

Covers: R-FLOW-4a to 4d, R-FLOW-5d, R-PRIV-13, N-1.
Preconditions: a need in "Llesta per publicar".

| # | Route and action | Expected result |
|---|---|---|
| 1 | On the need card press "Publica i envia la notificació" | State "Publicada", hint "Les preguntes són al banc de preguntes i el col·lectiu ha rebut una notificació al mòbil." `necessitat.estat = 'publicada'`. No `joincode` or `publicacio` row is created. Every subscribed device in the need's collective (all collectives when it has none) gets a push. A notice above the list reads "S'han enviat notificacions a N dispositius del col·lectiu.", or "…menys de 10 dispositius…" under 10, or says notifications are off when the VAPID keys are missing. HR never sees which accounts. |
| 2 | `/hr/publish` | Title "Enllaços i QR per col·lectiu". One card per collective with the code, link, QR, a "Copia" button, "Cartell per imprimir" (A4 poster at `/hr/publish/<codi>/poster`), "Publica a Teams" (`/hr/publish/<codi>/teams`, Adaptive Card titled "Escolta activa"), and "comptes al col·lectiu" (count only, `<10` when under 10). |
| 3 | Open a collective's join link on a phone (onboarding) | F-EMP-1. |

Notes: the card text shows the code and the link uses `PUBLIC_BASE_URL` (default `http://localhost:3000`; missing from `.env.example`, a known finding). Approved questions were already in the pool at F-HR-3 (the engine serves `aprovada` questions whatever the need's state); publishing marks the need and tells the collective. Join codes, links and QR are per collective, for onboarding only; the seed codes `DAMM-*` are always active.

Branches: `/hr/publish` with no code shows "Encara no hi ha cap codi d'invitació." and with no need "Encara no hi ha cap necessitat." The Teams card is a copyable payload; sending to Teams is not built (N-1 roadmap in `docs/teams-integration.md`).

### F-HR-5 Read the results

Covers: R-FLOW-6a to 6f, R-FLOW-7a to 7f, R-SC-A, R-BIAS-1 to 8, R-DIFF, R-PRIV-1, R-PRIV-2, R-DATA-1.
Preconditions: GATE-ON logged in, DB-demo (richer) or DB-seed, analysis tables filled.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/hr/results` | Header "Resultats", subtitle "Sempre en agregat. Els segments amb menys de 10 persones que han respost es mostren com a Suprimit". KPIs "Comptes actius", "Temes detectats", "Temes emergents", "Segments suprimits". |
| 2 | Scroll | Sections "Perfil per domini" (radar), "Temes dels comentaris", "Representativitat" (columns respostes, població, diferència; differences of 5 pp or more marked; per collective and per shift), "Tendències per domini" (mean 1–5 per period with n and precision: indicativa, moderada, sòlida), "Comptes per col·lectiu" ("Només recomptes, mai identitats"). |
| 3 | Choose a period in "Compara amb" (`?vs=`) | Comparison view for two periods. |
| 4 | Look at the Logística night segment (6 accounts in the seed) | "Suprimit" with hint "Menys de 10 persones han respost" everywhere (profile, representativity, trends, signals). Themes with under 10 comments show "Suprimit" with "Menys de 10 comentaris". |

Branches: no data gives "Encara no hi ha dades." / "Encara no hi ha temes." (empty states, no crash). Complementary suppression: if one hidden segment could be recovered by subtracting from a total, a second segment is also hidden. Direct reads never expose a comment tied to a person; only anonymised snippets of themes with 10 or more comments are shown. Engine insight cards are **built** (`hr/insight-cards.tsx`). Card titles: "Estat del domini", "Canvi destacat", "Polarització", "Importància i puntuació" (quadrants "Actua primer", "Mantén", "Vigila", "Prioritat baixa"), "Trajectòries", "Confirmació del seguiment", "Diferència entre grups". Bodies read like "Puntuació x/10 … confiança … consens …", "↑ Puja" / "↓ Baixa", each with a badge `n=`; suppressed rows are never shown. They need DB-demo (or a run of the engine job on DB-seed) to have content; the empty text depends on the page that embeds them.

Invariants: min group size 10 everywhere; no individual answer; no `compte_id`, username or single comment; HR pages import only `@damm/db/hr` and `@damm/shared`.

### F-HR-6 Export aggregated CSV

Covers: R-FLOW-6, R-PRIV-1, R-PRIV-2, R-DATA-9.
Preconditions: as F-HR-5.

| # | Action | Expected result |
|---|---|---|
| 1 | Press "Exporta CSV" (`GET /hr/results/export`) | Download `resultats-agregats-YYYY-MM-DD.csv`, UTF-8 with BOM, `Cache-Control: no-store`. Header `tipus,periode,collectiu,torn,domini,respondents,resp_pct,pop_pct,diferencia_pp,mitjana,suprimit`. Comment lines start with `#` and state the minimum group size 10. |
| 2 | Open the rows of the sub-10 group | No value, `suprimit=1`. No account id, username or free text anywhere in the file. |

Branch: with GATE-ON and no cookie, `curl -i /hr/results/export` redirects to `/hr-login` and returns no CSV.

### F-HR-7 Signals, recommendations, approval

Covers: R-FLOW-7, R-FLOW-8a to 8c, R-SC-A, N-2.
Preconditions: GATE-ON logged in, DB with `senyal` and `recomanacio` rows (seed or demo).

| # | Action | Expected result |
|---|---|---|
| 1 | `/hr` (home) | Counts, radar, pending items ("Res pendent: tot decidit." when none), recent signals (empty: "Encara no hi ha senyals."). |
| 2 | `/hr/recommendations` | Title "Recomanacions", subtitle "Senyals detectats a l'anàlisi i accions proposades per la IA. Una persona decideix quines tirar endavant." Cards "Senyals" and "Recomanacions". |
| 3 | Press "Veure detall →" on a signal | `/hr/signals/<id>` shows badges (type, severity, status, collective, period, `n=`, confidence), the status buttons under "Estat del senyal:", the timeline "Del senyal a l'acció", the trend table with "Relacionat" rows, "Temes relacionats" (only themes with 10+ comments; hidden ones counted in a note) and "Recomanacions". |
| 4 | Change the signal status | `senyal.status` changes. |
| 5 | On a recommendation press "Aprova" or "Descarta" | `recomanacio.estat` goes `proposada` → `aprovada` or `descartada`. Nothing is executed. |

Engine alarms have their own page, `/hr/signals` ("Alarmes", nav tab with a count badge): PageHeader title "Alarmes", subtitle "Senyals que detecta el motor a partir dels agregats. Cap és individual; cada una és revisada per una persona.", button "Recalcula ara"; card "Alarmes" with a count, empty text "Cap alarma activa."; each item has type and severity badges, a "Només l'equip de persones" badge when the audience is HR only, "{periode} · n={n}", the description, status transition buttons and a link "Veure detall →" to `/hr/signals/<id>`. Alarm types: `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `feble`, `low_confidence`, `improvement`. Statuses: open, acknowledged, action_linked, resolved. A 7-day cooldown stops the same alarm being re-raised. The detail page `/hr/signals/<id>` has the title of the signal type, the description, a button "← Recomanacions", "Estat del senyal:" status buttons and the card "Del senyal a l'acció" (4-step timeline, each step "Fet" or "Pendent"). Managers only see alarms of audience `hr_manager`.

Branches: `/hr/signals/abc` or an unknown id gives 404. A decided recommendation cannot be decided again (SQL guard on `estat = 'proposada'`). A signal with a hidden group shows `Suprimit`, never a number under 10.

Invariants: AI proposes, a human decides (R-X-3). The dashboard never calls the LLM.

### F-HR-8 Follow-up survey from a recommendation

Covers: R-FLOW-8a, R-FLOW-8b, R-FLOW-8d.
Preconditions: an **approved** recommendation with no follow-up yet.

| # | Action | Expected result |
|---|---|---|
| 1 | Press "Crea l'enquesta de seguiment" | Redirect to `/hr/needs`. A new need in "Esborrany", AI drafted, linked via `recomanacio.seguiment_necessitat_id`. Nothing approved. |
| 2 | Back on `/hr/recommendations` | Badge "Seguiment creat". The button is gone. |
| 3 | Continue with F-HR-3 and F-HR-4 | Questions enter the pool on approval; the collective is notified on publish. |
| 4 | Employee side | The collective's employees see the action in "Has dit, hem fet" with the badge "Enquesta de seguiment en marxa" (F-EMP-8). |

Branches: a recommendation that is not approved, or already has a follow-up, gives no new need. LLM down: draft from templates (F-HR-2 B1).

### F-HR-9 Close a need

Covers: R-FLOW-8, R-DEL.
Preconditions: a need in any state except "Tancada".

| # | Action | Expected result |
|---|---|---|
| 1 | Press "Tanca la necessitat" (on `/hr/needs` or `/hr/publish`) | `necessitat.estat = 'tancada'`. Card shows "Tancada", hint "L'equip l'ha tancada: ja no recull respostes de seguiment." |
| 2 | Filter `/hr/needs?estat=tancada` | The need is listed. A filter with no match shows `No hi ha cap necessitat en estat «…».` |

Branches:

- **B1 (confirmed gap).** `closeNecessitat` (`packages/db/src/hr-repository.ts`) only sets `necessitat.estat = 'tancada'`. The engine's `approvedQuestionsFor` filters on `pregunta.estat = 'aprovada'` and collective, and never looks at `necessitat.estat`. So an employee who has not yet answered a closed need's question still receives it. The earlier expectation "questions stop after closing" is wrong for the current code: test the actual behaviour (the question is still served) and record it as a known gap, not a regression.
- **B2** closing twice is a no-op.
- **B3** the join code stays active (it may serve other needs).

### F-HR-10 Methodology page

Covers: R-FLOW-7, R-BIAS (explanations), R-PRIV-2.
`/hr/methodology` ("Com es calcula?") explains confidence, precision labels, suppression and weighting in plain Catalan. Test: reachable from the nav, no crash, thresholds quoted (10, and the precision cut-offs) match those shown on the trend tables.

## 4. Manager flows

### F-MGR-1 Manager picks a collective

Covers: R-FLOW-6, N-8, R-PRIV-3.
Preconditions: GATE-ON logged in (the manager uses the HR gate; there is no separate manager login).

| # | Action | Expected result |
|---|---|---|
| 1 | `/manager` | Title "Vista de responsables", subtitle "Tria el col·lectiu del qual vols veure els resultats." Card "Col·lectius" with the note "Vista de només lectura amb dades agregades. No hi ha respostes ni comentaris individuals, i els grups de menys de 10 persones es mostren com a Suprimit. Només es mostren les recomanacions que l'equip de persones ha aprovat." and four collective links (`listCollectius()`). |
| 2 | Press a collective | `/manager/<name>` (URL-encoded). |

### F-MGR-2 Manager reads one collective

Covers: R-FLOW-6, R-FLOW-7, N-8.
| # | Action | Expected result |
|---|---|---|
| 1 | `/manager/Logística` | Title = collective name, subtitle "Resultats del col·lectiu: perfil per domini, tendència, temes i recomanacions aprovades.", latest period badge, button "Canvia de col·lectiu". Cards: "Perfil per domini" (radar, latest and previous period), "Recomanacions aprovades" (only `aprovada`, only this collective, badge "Enquesta de seguiment en marxa" when a follow-up exists), "Què destaca el motor" (engine insights of kinds top mover, polarisation, importance gap, trajectory mix, follow-up confirmation, segment gap, at most 8, scoped to this collective; empty text "Encara no hi ha prou respostes per destacar res (cal n ≥ 10)."), "Tendència per domini" with the precision legend, "Representativitat" (link "Com es calcula?"), "Temes dels comentaris" (labelled "Tota l'empresa, no només aquest col·lectiu"), "Senyals del col·lectiu" (audience `hr_manager`, `n >= 10`, `suprimit = 0`; empty "Cap senyal per a aquest col·lectiu."). |
| 2 | `/manager/Inexistent` | 404. |

Branch: empty states "Encara no hi ha recomanacions aprovades per a aquest col·lectiu." and "Cap senyal per a aquest col·lectiu."

Expected gaps (N-8, S-72): a manager is not bound to one collective. Anyone past the HR gate can open any collective (the manager layout is the HR shell behind the same gate). There is no manager role, no segment by centre or manager flag, no per-manager login. The engine data on the page is scoped to the opened collective (viewer `{role: "manager", collectiuId}`), but nothing restricts which collective a person may open. The test must expect all four collectives to be reachable, not a 403.

## 5. Anonymity and security viewpoint

### F-PRIV-1 Boundary is enforced in code

Covers: R-PRIV-3, R-PRIV-9, R-X-2.
1. `pnpm check:anonymity`: exits 0. It fails if HR code or `@damm/db/hr` touches raw `resposta` or `compte`, or if the analytics view exposes `compte_id`.
2. `pnpm lint`: exits 0; HR files may import only `@damm/db/hr` and `@damm/shared`.
3. `bash scripts/security-demo.sh`: plants a forbidden import in HR code, `pnpm lint` and `check:anonymity` fail, the script cleans up, both pass again, `git status` is clean.
4. Branch: `scripts/security-demo-account.mts` on a copy of the DB shows scrypt hashes and the recovery hash, never plaintext.

### F-PRIV-2 No individual data in the HR surface

Covers: R-PRIV-1, R-PRIV-2, R-PRIV-9.
Walk every HR and manager page and the CSV. No username, no `compte_id`, no raw comment tied to one person, no group under 10 with a value, no way to subtract a hidden segment from a total (complementary suppression). The view `v_resposta_analitica` has no `compte_id` column (`PRAGMA table_info`).

### F-PRIV-3 Account counts only

Covers: R-PRIV-3, R-PRIV-9.
"Comptes per col·lectiu" and the publish page show counts. A count under 10 reads `<10` (or null → suppressed). No list of accounts exists anywhere in HR.

### F-PRIV-4 Separation of sessions

Covers: R-PRIV-3.
`damm_session` and `hr_access` are separate cookies. Employee login does not open `/hr`. HR login does not create an employee session. A deleted account cannot keep using its cookie (F-EMP-3 B3).

### F-PRIV-5 Data at rest and logs

Covers: R-PRIV-4, R-PRIV-6.
Passwords and recovery codes are salted scrypt hashes. Request bodies and comments are not logged. Comments are stored redacted only (F-EMP-5 B5). Gaps: retention and deletion policy (R-PRIV-8) are not built; traceability of the approver is partial (F-HR-1).

### F-PRIV-6 Synthetic data only

Covers: R-X-1 (hard rule).
No real Damm or personal data in the DB, the seed, the comments JSON or the screenshots. No secrets in the repo: `.env` is not committed; `.env.example` has empty values.

## 6. Jobs and engine flows

### F-JOB-1 Engine job

Covers: R-FLOW-7, R-FLOW-5c, N-2, N-4.
Preconditions: a DB (dev or demo), `DB_PATH` set if not the default.
1. Run `pnpm --filter @damm/engine run job` (start with `source ~/.claude/bin/heavy-gate.sh` on this machine).
2. Expected: a JSON report with counts for aggregates, insights and alarms, and no error. Running it twice gives the same counts for the same data (deterministic).
3. The job is the only reader of per-account history (trajectories). It writes aggregates only, nothing per person.
Also available as `POST /api/jobs/run` (HR-gated like `/hr`; 409 while a run is in progress): `runEngineJob`, then `runCommentAnalysisSync`, then `runRecommendations`; returns the three reports. Idempotent: a second call opens no alarms and drafts no proposals.

### F-JOB-2 Daily batch from the engine (wired)

Covers: R-FLOW-5c, R-FLOW-5f, R-TENSION-1.
`getDailyBatch` gives the same batch all day (stored in `assignment`); order follow-up, HR need (`prioritat`, one per day), monitoring (domains ∝ priority with an outlier boost, 28-day soft item cooldown, Thompson-sampled format); 3 questions a day by default (`questionsPerDay`). `submitAnswers` rejection reasons `not_in_todays_batch`, `already_answered`, `invalid_value`, `missing_comment`. Status: wired into `GET /api/pool/next` and `POST /api/responses` via `apps/web/lib/engine.ts` (the engine tops the day up with published-need questions past the cap, see F-EMP-5); a scheduler runs the engine job every 10 minutes (`instrumentation.ts`). Testable from the API and the UI as in F-EMP-5. The "4 days in a row" statement of the older docs is not a rule in the code (see F-EMP-5).

### F-JOB-3 Seed and demo builds

Covers: R-DATA-1 to R-DATA-9.
- Seed: `pnpm --filter @damm/seed run seed` is fresh and deterministic; about 1,200 synthetic employees, about 700 responses over Aug, Sep, Oct 2026, about 500 comments; planted bias: low night-shift response, October emerging theme (shift system communication and breaks), Logística weak signal (safety equipment, heat), manager positivity, one sub-threshold group (Logística/nit, 6).
- Demo: `pnpm --filter @damm/engine run demo` builds `data/demo.db` with three months and planted stories (S-90). About 4 minutes.
- Comments: `pnpm --filter @damm/seed run comments` (template mode) or `-- --llm`. Committed JSON so nobody needs the key to seed.

### F-JOB-4 Daily push send (expected gap)

Covers: R-FLOW-5d. Not built. Pushes are sent only when HR publishes a need (F-HR-4, F-EMP-9); no scheduled job sends reminders.

## 7. Coverage matrix (requirement → flows)

Only requirements that a flow here touches are listed with their flows. Statuses come from `docs/requirements.md`.

| Requirement | Flows |
|---|---|
| R-X-1 | F-PRIV-6, F-JOB-3 |
| R-X-2 | F-PRIV-1, F-PRIV-2 |
| R-X-3 | F-HR-1, F-HR-2, F-HR-3, F-HR-7 |
| R-CH-1 | F-EMP-1 |
| R-CH-5 | F-EMP-9 (gap) |
| R-U-1 | F-EMP-5, F-EMP-6 |
| R-U-2 | F-EMP-7 |
| R-U-3 | F-EMP-8 |
| R-FLOW-1a to 1e | F-HR-2 (1c and 1e partial) |
| R-FLOW-2a to 2d, 2f, 2g | F-HR-2, F-HR-3 |
| R-FLOW-2e | F-HR-2 (gap) |
| R-FLOW-3a to 3d | F-HR-3 |
| R-FLOW-3e | F-HR-2 (gap) |
| R-FLOW-4a to 4d | F-HR-4 |
| R-FLOW-5a | F-EMP-5, F-EMP-6 |
| R-FLOW-5b | F-EMP-1, F-EMP-2 |
| R-FLOW-5c, 5f | F-EMP-5, F-JOB-2 (engine wired) |
| R-FLOW-5d | F-EMP-9, F-JOB-4 (gap) |
| R-FLOW-6a to 6f | F-HR-5, F-HR-6, F-MGR-2 (6b, 6c, 6e partial) |
| R-FLOW-7a to 7f | F-HR-5, F-HR-7 (incl. Alarmes page), F-JOB-1 |
| R-FLOW-8a to 8d | F-HR-7, F-HR-8, F-HR-9, F-EMP-8 |
| R-SC-A | F-HR-5, F-HR-7 |
| R-BIAS-1 to 8 | F-HR-5, F-HR-10, F-JOB-3 |
| R-DIFF-1 to 8 | F-HR-5, F-HR-10 |
| R-TENSION-1 | F-EMP-5, F-JOB-2 |
| R-PRIV-1, 2 | F-HR-5, F-HR-6, F-PRIV-2 |
| R-PRIV-3 | F-PRIV-1, F-PRIV-3, F-PRIV-4, F-MGR-1 |
| R-PRIV-4 | F-EMP-2, F-EMP-4, F-PRIV-5 |
| R-PRIV-6 | F-PRIV-5 |
| R-PRIV-8 | F-EMP-10 (partial: the person can delete their own account; no retention policy) |
| R-PRIV-9 | F-PRIV-1, F-PRIV-2, F-HR-1 |
| R-PRIV-10 | F-HR-1, F-HR-3 (partial) |
| R-PRIV-13 | F-EMP-1 to F-EMP-4, F-EMP-7, F-HR-4 |
| R-DATA-1 to 9 | F-EMP-5, F-JOB-3 |
| R-DOM-5 | F-EMP-2 (gap) |
| N-1 | F-HR-4 (card only) |
| N-2, N-4 | F-HR-7, F-JOB-1 |
| N-8 | F-MGR-1, F-MGR-2 (gap) |
| N-12 | F-EMP-9 (gap) |

**Requirements with no flow, to review** (not exhaustive; check each against `docs/requirements.md` before adding a case):

- **Must with no flow and no code:** R-PRIV-8 (retention) has only a gap note, not a testable flow. R-FLOW-2e and R-FLOW-3e likewise.
- **Not covered because the requirement text is about the pitch, not the product:** R-CH-2 to R-CH-4, R-CH-6, R-DEL-1 to R-DEL-9 (deliverables). Cover them with `docs/demo-script.md` and `docs/slide-notes.md`, not with a flow.
- **Not covered, product-level, no flow written:** R-SC-B (B1 to B3), R-SC-C (C1 to C6), R-DOM-1 to R-DOM-4, R-DIFF items about question design, N-3 (kiosk), N-5, N-6, N-13, N-15, N-16 to N-18. These need a decision on whether a flow is worth writing.

## 8. Mapping to e2e cases (`docs/e2e-test-plan.md`)

The plan was reworked against this file (2026-11-07). Every M-* and S-* case now cites its F-* flow and requirement IDs; section 4 of the plan holds the flow-to-case map. The gap list below is kept as the record of what the rework had to cover.

### Gap list for the rework (all items now have a case in the plan)

1. **Closed need still served (F-HR-9 B1).** Confirmed gap in the engine's `approvedQuestionsFor`. The plan tests the actual behaviour and records it as a known gap.
2. **"Has dit, hem fet" (F-EMP-8).**
3. **Form validation in HR (F-HR-2 B2 to B6).**
4. **Empty pool and day cap (F-EMP-5 B1; 3 a day by default).**
5. **Deleted account with live cookie (F-EMP-3 B3), second use of a recovery code (F-EMP-4), inactive code mid-flow (F-EMP-2 B5).**
6. **Approver recording (F-HR-3).** `aprovada_per = 'hr-demo'` and `aprovada_el`; R-PRIV-10 stays partial.
7. **Manager scope (S-72).** All collectives open is the expected current behaviour (N-8 gap), not a failure.
8. **Atomic batch in `POST /api/responses`.**
9. **PII redaction forms** beyond one name, email and phone: DNI/NIE and IBAN.
10. **`/privacitat` content** and its links from `/join/[codi]` and `/settings`.
11. **Methodology page (F-HR-10)** and the CSV header, BOM and filename (F-HR-6).
12. **Repo scan for secrets and real data (F-PRIV-6).**
13. **Account management (F-EMP-10)**, **Alarmes page and insight cards (F-HR-5, F-HR-7)**.

Stale statements found in other docs (outside this brief, not fixed here): `docs/requirements.md` says the approver is not recorded (it is stored as `hr-demo`); `docs/employee-pwa-spec.md` says the join code travels in the session (it travels in `?codi=`) and lists an empty state "Res més per avui" and a push toggle that do not exist. The `/join` copy says "Dues preguntes breus al dia" while the engine default is 3 a day.
