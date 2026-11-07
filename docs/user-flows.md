# User flows

Expected paths through the product, written so the e2e runbook (`docs/e2e-test-plan.md`) can be reworked into sharper tests. Scope comes from `docs/requirements.md`. Written 2026-11-07 against the code on `jan/dev` (employee, HR and manager routes read from `apps/web/app`, rules read from `packages/db/src`).

How to read this:

- A flow has an ID, the requirement IDs it covers, preconditions, numbered steps (route, action, exact expected result), branches and invariants.
- UI text is the real Catalan copy from the code. DB effects name the table and column.
- **Current** means what the code does today. **Target** means what the docs promise and the code does not do yet. **Expected gap** means the feature is not built: a test must expect its absence, not its behaviour.
- Nothing here is invented. Where the docs and the code disagree, both are named and the flow follows the code.

## 0. Preconditions used by the flows

| Tag | Meaning |
|---|---|
| **DB-seed** | Dev DB from `pnpm --filter @damm/seed run seed` (`data/app.db`). About 1,200 synthetic employees, about 700 responses, about 500 comments. Join codes `DAMM-FAB`, `DAMM-LOG`, `DAMM-COM`, `DAMM-OFI`. Logística/nit has 6 accounts by design (below 10). |
| **DB-demo** | `DB_PATH=data/demo.db`, built by `pnpm --filter @damm/engine run demo` (about 4 min). Three months of synthetic answers, planted alarms and insights (stories S-90). Join codes are `DEMO-<first three letters of the collective>`; read the real values from the `joincode` table before testing. |
| **GATE-ON** | `HR_ACCESS_CODE` is set in `.env`. `/hr`, `/manager` and their subpaths redirect to `/hr-login?next=<path>` without the cookie `hr_access`. |
| **GATE-OFF** | `HR_ACCESS_CODE` is empty. The gate is off and `/hr` opens directly. |
| **LLM-ON** | `LLM_API_KEY` and `LLM_BASE_URL` set. Model `ornith`. |
| **LLM-OFF** | No key or a dead host. Drafting falls back to templates. |
| **EMP-OUT** | No `damm_session` cookie. |
| **EMP-IN** | Valid `damm_session` cookie (HMAC signed, 30 days) and the account row still exists. |

Time: "today" for the employee flow is the Europe/Madrid calendar day (`madridDay`). `resposta.data` is stored in UTC. The current date at writing is 2026-11-07.

Wiring status that changes many expected results: the engine package (`@damm/engine`) is merged but **not wired into the routes**. `GET /api/pool/next` and `POST /api/responses` still use a stub in `packages/db/src/employee-repository.ts`. A separate session (`engine-integration`) is doing the wiring. Flows below describe the stub as **Current** and the engine behaviour as **Target**.

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
| 1 | Open `/join/DAMM-LOG` (link or QR from the publish page). | Heading "Et donem la benvinguda a Demo" (company comes from `joincode.empresa`). A "Col·lectiu" card shows Logística. Text "Les teves respostes són anònimes i només es mostren de forma agregada." A link "Com tractem les teves dades" goes to `/privacitat`. Button "Continua". |
| 2 | Press "Continua". | URL becomes `/onboarding?codi=DAMM-LOG`. The code travels in the query, not in the session (the spec says session; the code differs). |

Branches:

- **B1 typed entry.** Open `/join`, heading "Introdueix el teu codi", field "Codi d'accés" (placeholder `DAMM-XXX`), button "Continua". `goToJoinAction` trims, uppercases, turns spaces and underscores into `-` and drops anything outside `A-Z0-9-`. ` damm fab ` and `damm_fab` both give `/join/DAMM-FAB`.
- **B2 missing hyphen.** `dammfab` goes to `/join/DAMMFAB` and shows "Codi no vàlid". The form does not insert the hyphen. This is a known finding, not a bug in the test.
- **B3 empty field.** Submit with nothing: redirected back to `/join`.
- **B4 lowercase URL.** `/join/damm-fab` works (code uppercased).
- **B5 wrong code.** `/join/XXXX`: "Codi no vàlid", text "Aquest codi no existeix o ja no està actiu. Comprova l'enllaç o demana un codi nou al teu equip.", link "Torna a provar amb un altre codi" to `/join`.
- **B6 inactive code.** `joincode.actiu = 0`: same screen as B5.
- **B7 direct onboarding with a bad code.** `/onboarding?codi=NOPE` shows "Codi no vàlid" with link "Introdueix un altre codi".

Invariants: the page shows company and collective only. No personal field. A join code identifies one collective, never a person.

### F-EMP-2 Onboarding and recovery code

Covers: R-PRIV-4, R-PRIV-13, R-FLOW-5b, R-DATA-5.
Preconditions: F-EMP-1 reached step 2 with a valid code.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/onboarding?codi=DAMM-LOG` | Heading "Crea el teu compte", line "Demo · Logística". Fields "Nom d'usuari", "Contrasenya", "Repeteix la contrasenya". Button "Crea el compte". Link "Ja tens compte? Inicia la sessió". No centre, shift or manager question (expected gap vs the spec: R-DOM-5, N-8). |
| 2 | Fill `usuari.prova`, a password of 8+ characters twice, press "Crea el compte". | A session cookie `damm_session` is set. The screen shows "Compte creat" and a one-time recovery code (groups of 4 characters, alphabet without 0/O/1/I/L). Checkbox "L'he desat". Button "Continua" is disabled. |
| 3 | Tick "L'he desat", press "Continua". | Redirect to `/`. |

DB effect after step 2: one `compte` row with `id` = random UUID, `collectiu_id` = Logística, `username` = `usuari.prova`, `password_hash`, `salt`, `recovery_hash` all hex scrypt. No email, phone or name column. The recovery code itself is not stored.

Branches (exact errors):

- **B1** repeat differs: "Les contrasenyes no coincideixen."
- **B2** username not matching `^[a-z0-9._-]{3,30}$` after trim and lowercase (2 characters, spaces, accents): "L'usuari ha de tenir entre 3 i 30 caràcters: lletres minúscules, xifres, punt, guió o guió baix." Capitals are lowercased first, so `Prova` is accepted as `prova`.
- **B3** password under 8: "La contrasenya ha de tenir almenys 8 caràcters."
- **B4** username taken: "Aquest nom d'usuari ja existeix. Prova'n un altre." (SQLite unique constraint.)
- **B5** code became inactive between pages: "Aquest codi no és vàlid o ja no està actiu."
- **B6** reload of the recovery screen after leaving: the code is not shown again (it is only returned once). Expected gap: no regenerate control (S-26).

Invariants: `compte.id` is not derived from username or code. Password and recovery code are salted-hashed. HR cannot read `compte`.

### F-EMP-3 Log in and log out

Covers: R-PRIV-13, R-FLOW-5a.
Preconditions: an account exists, EMP-OUT.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/` | Redirect to `/login`. |
| 2 | `/login` | Heading "Inicia la sessió", fields "Nom d'usuari" and "Contrasenya", button "Entra", button-link "He perdut la contrasenya", line "Primera vegada? Obre l'enllaç d'invitació del teu equip." |
| 3 | Enter correct credentials, "Entra". | Redirect to `/`, cookie set, today's questions load (F-EMP-5). |
| 4 | `/settings` → "Tanca la sessió". | Push subscription row for the account deleted (none exists today), cookie destroyed, redirect to `/login`. `/` redirects to `/login` again. |

Branches:

- **B1** wrong password or unknown username: same text "Usuari o contrasenya incorrectes." (no user enumeration; the unknown-user path burns comparable hash time).
- **B2** rate limit: 5 failed attempts per username in 15 minutes. From the sixth try, even with the right password: "Massa intents. Torna-ho a provar d'aquí a una estona." In memory, per process, so a server restart resets it.
- **B3** deleted account with a still-valid cookie: `getCompteId()` also checks `compteExists`, so the session is treated as invalid and the user goes to `/login`.
- **B4** username case: `USUARI.PROVA` matches `usuari.prova` (lowercased).

Invariants: the account comes from the cookie only, never from a request parameter. An employee login does not unlock `/hr` (separate cookie).

### F-EMP-4 Forgot password (one-time recovery code)

Covers: R-PRIV-4, R-PRIV-13.
Preconditions: account exists, recovery code known.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/login` → "He perdut la contrasenya". | Form "Recupera el compte": "Nom d'usuari", "Codi de recuperació", "Contrasenya nova", button "Canvia la contrasenya". Link "Torna a l'inici de sessió". |
| 2 | Enter username, code (dashes and case ignored), a new password of 8+. | Password changes, the user is logged in, screen "Contrasenya canviada" with a **new** recovery code and the "L'he desat" checkbox. |
| 3 | Try the old password. | "Usuari o contrasenya incorrectes." |
| 4 | Try the **old** recovery code again. | "Usuari o codi de recuperació incorrectes." (compare-and-set on `recovery_hash`: a used code never works twice.) |

Branches: wrong code or unknown user gives the same message "Usuari o codi de recuperació incorrectes." Short new password gives "La contrasenya ha de tenir almenys 8 caràcters." Recovery attempts share the 5 per 15 minutes limiter with login ("Massa intents…").

### F-EMP-5 Answer today's questions

Covers: R-FLOW-5a, R-FLOW-5c, R-FLOW-5f, R-TENSION-1, R-DATA-2 to R-DATA-6, R-U-1.
Preconditions: EMP-IN, DB-seed or DB-demo, approved questions visible to the account's collective.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/` | While loading: "Carregant les preguntes d'avui…" (screen-reader text over a skeleton). `GET /api/pool/next` returns `{ preguntes: [...] }` with `Cache-Control: no-store`. |
| 2 | First question shows | "Pregunta 1 de N", a badge "Anònim", a progress bar, the renderer for the type (`scale5`, `scale10`, `yes_no`, `pair`, `choice`, `ranking`, `open`; swipe for pair). Submit button disabled until the draft is answerable. |
| 3 | Answer and press "Envia i continua" (last question: "Envia") | Button reads "Enviant…". `POST /api/responses` returns 204. Next question appears. |
| 4 | After the last answer | Card "Avui ja has acabat", text "Tornem demà amb un parell de preguntes.", and "Gràcies! Les teves respostes són anònimes. Mai et farem més de 2 preguntes al dia." |

DB effect per answer: one `resposta` row with `compte_id`, `pregunta_id`, `valor_num` (scale 1–5 for `scale5`, 0–10 for `scale10`, 0–1 for `yes_no`, option index for `pair`/`choice`), `value_json` (ranking order, best first), `comentari` (open only, redacted), `canal = 'app'`, `periode` = server month `YYYY-MM`, `answer_ms`, `data` UTC.

**Current (stub):**

- Pool = approved questions (`pregunta.estat = 'aprovada'`) with `collectiu_id` NULL or equal to the account's collective, not answered today, ordered by `prioritat` descending then id, capped so the account never has more than 2 answered plus offered in the Madrid day.
- No 4-day repeat rule. The same question can return tomorrow. Expected gap vs R-FLOW-5f until the engine is wired.
- No follow-up, outlier sampling, format or timing per collective or shift (R-FLOW-5c).
- The stub does not filter by `necessitat.estat`, so questions of a closed need stay in the pool (see F-HR-9 B1, suspected gap, verify).

**Target (engine wired):** `getDailyBatch` returns the same batch all day, ordered follow-up, then approved HR need, then monitoring; about 2 a day; no same question 4 days in a row; more sampling on outliers. `submitAnswers` rejects with `not_in_todays_batch`, `already_answered`, `invalid_value`, `missing_comment`.

Branches:

- **B1 empty pool** (no approved question for the collective, or 2 already answered): step 4 screen shown at once, no question.
- **B2 repeat answer** (second tab): `POST` returns 409 `ja_respost`; the UI treats 409 as done and moves on. No second row.
- **B3 invalid payload via API** (logged in): 400 `pregunta_invalida` (unknown, not approved, or other collective's question), 400 `valor_invalid` (out of range, wrong type, bad ranking permutation), 400 `comentari_obligatori` (open question without text), 400 `peticio_invalida` (zod shape, comentari over 1000), 400 `json_invalid`. All-or-nothing: a batch with one bad item stores nothing.
- **B4 not logged in:** `GET /api/pool/next` and `POST /api/responses` return 401 `no_autenticat`; the UI goes to `/login`.
- **B5 open question with PII:** a comment with a name ("Em dic Anna Puig"), an email, a phone (9 to 15 digits), a DNI/NIE or an IBAN is stored with `[nom]`, `[correu]`, `[telèfon]`, `[DNI]`, `[compte]`. If redaction throws, 500-class `redaccio_fallida` and nothing is stored. Redaction is regex, best effort.
- **B6 Madrid day rollover:** a new batch starts at 00:00 Europe/Madrid, not UTC, including both DST changes. Check with `pnpm --filter @damm/db run madrid-check`.
- **B7 careless answers:** `answer_ms` stored for non-open questions (R-BIAS, C1 data only; no UI use).

Invariants: the response is tied to `compte_id` only in `resposta`; HR code never reads that table (F-PRIV-1).

### F-EMP-6 Answer flow when the network or server fails

Covers: R-FLOW-5a, R-U-1.
Preconditions: EMP-IN, a question on screen.

| # | Action | Expected result |
|---|---|---|
| 1 | Type a comment, set the browser offline, press "Envia". | Alert: "Sense connexió. La teva resposta continua aquí: torna-ho a provar quan tornis a tenir xarxa." Button now says "Torna-ho a provar". Text is kept. |
| 2 | Go online, press "Torna-ho a provar". | Sent, next question or the done card. |
| 3 | Reload before sending. | The draft is restored from `localStorage` key `damm:draft:v1:<compteId>:<questionId>`. After a successful send the key is removed. Drafts of questions not in today's pool are pruned. |

Branches: server 5xx on POST gives "No s'ha pogut enviar la resposta. La teva resposta continua aquí: torna-ho a provar." Server unreachable while online: "No hem pogut connectar amb el servidor. …". Pool load fails: "No s'han pogut carregar les preguntes." with button "Torna-ho a provar"; offline variant: "Sembla que no tens connexió. Comprova la xarxa i torna-ho a provar." Blocked `localStorage`: the app still works, the draft just does not survive a reload.

Invariant: the draft lives on the device only and is never sent before the person presses send.

### F-EMP-7 Settings and privacy page

Covers: R-PRIV-3, R-PRIV-13, R-U-2.
Preconditions: EMP-IN.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/settings` | Heading "Configuració". Card "Privadesa" with link "Llegeix com tractem les dades". Card "Sessió" with button "Tanca la sessió". |
| 2 | Follow the privacy link or `/privacitat` | Heading "Com tractem les teves dades" with sections "Què recollim", "Què veu Recursos Humans", "Què no fem mai", "Comentaris lliures", "Sessió i compte". Reachable without a session from `/join/[codi]`. |

Expected gaps (not built, the spec lists them): push toggle (R-FLOW-5d, F-EMP-9), change password (S-24), delete account (S-25, R-PRIV-8 retention), regenerate recovery code (S-26).

### F-EMP-8 "Has dit, hem fet" (closing the loop for the employee)

Covers: R-FLOW-8, R-FLOW-6 (loop), R-U-3.
Preconditions: EMP-IN, at least one `recomanacio` with `estat = 'aprovada'` for the account's collective (DB-demo or after F-HR-7).

| # | Action | Expected result |
|---|---|---|
| 1 | Open `/` | Below the answer flow, section "Has dit, hem fet" lists approved actions for the collective only (`approvedActionsForCompte`). If the action has a follow-up need, the badge "Enquesta de seguiment en marxa" is shown. |

Branches: no approved action for that collective means the section is absent or empty (verify in the browser which). An action for another collective is never shown. Text is the recommendation text, aggregate context only.

### F-EMP-9 Push notifications (expected gap)

Covers: R-FLOW-5d, N-12, R-CH-5.
Status: **not built.** No `/api/push/subscribe`, no toggle in `/settings`, no `web-push` send job. `push_subscripcio` exists in the schema; logout already deletes rows from it. A test must expect the absence of any permission prompt and any notification. When built (Jan): permission only after a tap in `/settings`; one row keyed by `compte_id`; generic text "Tens preguntes noves" with no question text; row deleted on logout and account deletion; never joined to analytics; iOS needs the PWA on the home screen (16.4+); public HTTPS needed (tunnel).

### F-EMP-10 Account management (expected gap)

Covers: R-PRIV-8, R-PRIV-13.
Status: **not built** in `/settings`: change password, delete account ("Esborra el meu compte" in the spec), regenerate recovery code. Expected on delete: account and push subscription removed; past `resposta` rows stay and cannot be traced to a person. Today the only way to remove an account is directly in the DB, which also makes F-EMP-3 B3 testable.

## 3. HR flows

### F-HR-1 Enter the HR portal

Covers: R-X-3, R-PRIV-3, R-PRIV-9.
Preconditions: GATE-ON.

| # | Route and action | Expected result |
|---|---|---|
| 1 | Open `/hr` with no cookie | Redirect to `/hr-login?next=/hr`. Page "Portal de persones", "Accés restringit a l'equip de persones. Introdueix el codi d'accés de la demo.", field "Codi d'accés", button "Entra". |
| 2 | Wrong code, "Entra" | Stays on the page with the alert "Codi incorrecte." No cookie. |
| 3 | Right code, "Entra" | Cookie `hr_access` set, redirect to the `next` path (`/hr` here). Nav: "Inici", "Necessitats", "Enllaços i QR", "Resultats", "Recomanacions", "Com es calcula?". |

Branches:

- **B1** every gated path redirects with its own `next`: `/hr/results`, `/hr/publish`, `/hr/needs`, `/hr/recommendations`, `/hr/methodology`, `/hr/signals/<id>`, `/manager`, `/manager/<collective>`, and `/hr/results/export` (no CSV without the cookie).
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
| 2 | Fill an objective of 15+ characters, a duration of 30+ seconds, press "Generar esborranys". | Button "Generant…" and text "La IA està redactant les preguntes…". |
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
| 1 | Edit a question text, press "Desar text" | `pregunta.text` updated (draft rows only). |
| 2 | Move a question with the up or down control | `ordre` swaps with its neighbour. |
| 3 | Press "Regenerar" on a question | The AI (or template) replaces that draft; badge reflects its source. |
| 4 | Press "Descartar" on a question | `pregunta.estat = 'retirada'`. Gone from the draft list. |
| 5 | Edit title and introduction, press "Desar títol i introducció" | `necessitat` header updated; empty title is ignored. |
| 6 | Press "Aprovar" on each remaining question | Each moves to "Preguntes aprovades". `pregunta.estat = 'aprovada'`, `prioritat = 100` (when tied to a need), `aprovada_per = 'hr-demo'`, `aprovada_el` set. When no draft is left and at least one is approved, the need card shows "Llesta per publicar". |

Branches: approving or editing a question that is no longer `draft` does nothing (SQL guards on `estat = 'draft'`). Discarding every question leaves the need in "Esborrany" with no approved question, so "Publicar amb enllaç i QR" must not appear (verify). `approveQuestion` is the only code path that sets `estat = 'aprovada'`.

Invariant: AI proposes, a human decides. Nothing reaches the pool before step 6.

### F-HR-4 Publish with link and QR

Covers: R-FLOW-4a to 4d, R-PRIV-13, N-1.
Preconditions: a need in "Llesta per publicar".

| # | Route and action | Expected result |
|---|---|---|
| 1 | On the need card press "Publicar amb enllaç i QR" | State "Publicada". For a need tied to one collective, one `joincode` and one `publicacio` row; for a need for all collectives, one per collective (four). Codes are 8 hex characters (`crypto.randomBytes(4)`), link `<PUBLIC_BASE_URL>/join/<CODE>`. `necessitat.estat = 'publicada'`. |
| 2 | `/hr/publish` | Title "Enllaços i QR per col·lectiu". One card per collective with the code, link, QR, a "Copia" button, "Cartell per imprimir" (A4 poster at `/hr/publish/<codi>/poster`), "Publica a Teams" (`/hr/publish/<codi>/teams`, Adaptive Card titled "Escolta activa"), and "comptes al col·lectiu" (count only, `<10` when under 10). |
| 3 | Open the join link on a phone | F-EMP-1. |

Notes: the card text shows the code and the link uses `PUBLIC_BASE_URL` (default `http://localhost:3000`; missing from `.env.example`, a known finding). Approved questions were already in the pool at F-HR-3; publishing only adds access (code, link, QR). The seed codes `DAMM-*` are separate and always active.

Branches: `/hr/publish` with no code shows "Encara no hi ha cap codi d'accés." and with no need "Encara no hi ha cap necessitat." The Teams card is a copyable payload; sending to Teams is not built (N-1 roadmap in `docs/teams-integration.md`).

### F-HR-5 Read the results

Covers: R-FLOW-6a to 6f, R-FLOW-7a to 7f, R-SC-A, R-BIAS-1 to 8, R-DIFF, R-PRIV-1, R-PRIV-2, R-DATA-1.
Preconditions: GATE-ON logged in, DB-demo (richer) or DB-seed, analysis tables filled.

| # | Route and action | Expected result |
|---|---|---|
| 1 | `/hr/results` | Header "Resultats", subtitle "Sempre en agregat. Els segments amb menys de 10 respondents es mostren com a Suprimit". KPIs "Comptes actius", "Temes detectats", "Temes emergents", "Segments suprimits". |
| 2 | Scroll | Sections "Perfil per domini" (radar), "Temes dels comentaris", "Representativitat" (columns respostes, població, diferència; differences of 5 pp or more marked; per collective and per shift), "Tendències per domini" (mean 1–5 per period with n and precision: indicativa, moderada, sòlida), "Comptes per col·lectiu" ("Només recomptes, mai identitats"). |
| 3 | Choose a period in "Compara amb" (`?vs=`) | Comparison view for two periods. |
| 4 | Look at the Logística night segment (6 accounts in the seed) | "Suprimit" with hint "Menys de 10 respondents" everywhere (profile, representativity, trends, signals). Themes with under 10 comments show "Suprimit" with "Menys de 10 comentaris". |

Branches: no data gives "Encara no hi ha dades." / "Encara no hi ha temes." (empty states, no crash). Complementary suppression: if one hidden segment could be recovered by subtracting from a total, a second segment is also hidden. Direct reads never expose a comment tied to a person; only anonymised snippets of themes with 10 or more comments are shown. Insight cards from the engine (domain state, top mover, polarisation, importance gap, trajectories) are **in progress** (engine integration, M-20b).

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
| 5 | On a recommendation press "Aprovar" or "Descartar" | `recomanacio.estat` goes `proposada` → `aprovada` or `descartada`. Nothing is executed. |

Branches: `/hr/signals/abc` or an unknown id gives 404. A decided recommendation cannot be decided again (SQL guard on `estat = 'proposada'`). A signal with a hidden group shows `Suprimit`, never a number under 10.

Invariants: AI proposes, a human decides (R-X-3). The dashboard never calls the LLM.

### F-HR-8 Follow-up survey from a recommendation

Covers: R-FLOW-8a, R-FLOW-8b, R-FLOW-8d.
Preconditions: an **approved** recommendation with no follow-up yet.

| # | Action | Expected result |
|---|---|---|
| 1 | Press "Crear enquesta de seguiment" | Redirect to `/hr/needs`. A new need in "Esborrany", AI drafted, linked via `recomanacio.seguiment_necessitat_id`. Nothing approved. |
| 2 | Back on `/hr/recommendations` | Badge "Seguiment creat". The button is gone. |
| 3 | Continue with F-HR-3 and F-HR-4 | Questions enter the pool on approval; link published. |
| 4 | Employee side | The collective's employees see the action in "Has dit, hem fet" with the badge "Enquesta de seguiment en marxa" (F-EMP-8). |

Branches: a recommendation that is not approved, or already has a follow-up, gives no new need. LLM down: draft from templates (F-HR-2 B1).

### F-HR-9 Close a need

Covers: R-FLOW-8, R-DEL.
Preconditions: a need in any state except "Tancada".

| # | Action | Expected result |
|---|---|---|
| 1 | Press "Tanca la necessitat" (on `/hr/needs` or `/hr/publish`) | `necessitat.estat = 'tancada'`. Card shows "Tancada", hint "Decisió de l'equip: no hi entren noves respostes de seguiment." |
| 2 | Filter `/hr/needs?estat=tancada` | The need is listed. A filter with no match shows `No hi ha cap necessitat en estat «…».` |

Branches:

- **B1 (suspected gap, verify first).** `closeNecessitat` only updates `necessitat.estat`. The stub pool query (`nextQuestionsForToday`) filters on `pregunta.estat = 'aprovada'` and does not look at `necessitat.estat`. So an employee probably still receives the questions of a closed need today. M-24 expects the opposite. Test it before relying on M-24.
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
| 1 | `/manager` | Title "Vista de responsables", subtitle "Tria el col·lectiu del qual vols veure els resultats." Note: "Vista de només lectura amb dades agregades. No hi ha respostes ni comentaris individuals, i els grups de menys de 10 persones es mostren com a Suprimit. Només es mostren les recomanacions que l'equip de persones ha aprovat." Four collective links. |
| 2 | Press a collective | `/manager/<name>` (URL-encoded). |

### F-MGR-2 Manager reads one collective

Covers: R-FLOW-6, R-FLOW-7, N-8.
| # | Action | Expected result |
|---|---|---|
| 1 | `/manager/Logística` | Title = collective name, latest period badge, link "Canvia de col·lectiu". Cards: "Perfil per domini" (radar, latest and previous period), "Recomanacions aprovades" (only `aprovada`, only this collective, badge "Enquesta de seguiment en marxa" when a follow-up exists), "Tendència per domini" with the precision legend, representativity rows for this collective and its shifts, themes (non-suppressed), signals visible to managers (`audience = 'hr_manager'`, `n >= 10`, `suprimit = 0`). |
| 2 | `/manager/Inexistent` | 404. |

Branch: no data gives "Encara no hi ha dades visibles per a aquest col·lectiu." and "Encara no hi ha recomanacions aprovades per a aquest col·lectiu."

Expected gaps (N-8, S-72): a manager is not bound to one collective. Anyone past the HR gate can open any collective. There is no manager role, no segment by centre or manager flag, no per-manager login. The test must expect all four collectives to be reachable, not a 403.

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
Branch: there is no `POST /api/jobs/run` (known finding); only the script exists.

### F-JOB-2 Daily batch from the engine (target, not wired)

Covers: R-FLOW-5c, R-FLOW-5f, R-TENSION-1.
`getDailyBatch` gives the same batch all day; order follow-up, HR need, monitoring; about 2 a day; no same question 4 days in a row; approved needs first (`prioritat`); more sampling on outliers; format and timing per collective and shift. `submitAnswers` rejection reasons `not_in_todays_batch`, `already_answered`, `invalid_value`, `missing_comment`. Status: package merged, routes still use the stub. Tests for this flow must wait for the wiring session. Until then F-EMP-5 describes the stub.

### F-JOB-3 Seed and demo builds

Covers: R-DATA-1 to R-DATA-9.
- Seed: `pnpm --filter @damm/seed run seed` is fresh and deterministic; about 1,200 synthetic employees, about 700 responses over Aug, Sep, Oct 2026, about 500 comments; planted bias: low night-shift response, October emerging theme (shift system communication and breaks), Logística weak signal (safety equipment, heat), manager positivity, one sub-threshold group (Logística/nit, 6).
- Demo: `pnpm --filter @damm/engine run demo` builds `data/demo.db` with three months and planted stories (S-90). About 4 minutes.
- Comments: `pnpm --filter @damm/seed run comments` (template mode) or `-- --llm`. Committed JSON so nobody needs the key to seed.

### F-JOB-4 Daily push send (expected gap)

Covers: R-FLOW-5d. Not built (see F-EMP-9). No job sends anything.

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
| R-FLOW-5c, 5f | F-EMP-5 (stub), F-JOB-2 (target) |
| R-FLOW-5d | F-EMP-9, F-JOB-4 (gap) |
| R-FLOW-6a to 6f | F-HR-5, F-HR-6, F-MGR-2 (6b, 6c, 6e partial) |
| R-FLOW-7a to 7f | F-HR-5, F-HR-7, F-JOB-1 |
| R-FLOW-8a to 8d | F-HR-7, F-HR-8, F-HR-9, F-EMP-8 |
| R-SC-A | F-HR-5, F-HR-7 |
| R-BIAS-1 to 8 | F-HR-5, F-HR-10, F-JOB-3 |
| R-DIFF-1 to 8 | F-HR-5, F-HR-10 |
| R-TENSION-1 | F-EMP-5, F-JOB-2 |
| R-PRIV-1, 2 | F-HR-5, F-HR-6, F-PRIV-2 |
| R-PRIV-3 | F-PRIV-1, F-PRIV-3, F-PRIV-4, F-MGR-1 |
| R-PRIV-4 | F-EMP-2, F-EMP-4, F-PRIV-5 |
| R-PRIV-6 | F-PRIV-5 |
| R-PRIV-8 | F-EMP-10 (gap) |
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

| Flow | Existing cases | Notes |
|---|---|---|
| F-EMP-1 | M-10, S-10, S-11, S-12, S-13, S-14 | B3 (empty field), B6 (inactive code), B7 (direct onboarding with bad code) not covered. |
| F-EMP-2 | M-11, S-15 | B5 (code turned inactive mid-flow) and B6 (recovery screen shown once) not covered. |
| F-EMP-3 | S-20, S-21, S-22, S-27 | B3 (deleted account with valid cookie) and B4 (username case) not covered. |
| F-EMP-4 | S-23 | "Old recovery code fails a second time" and the shared rate limiter not covered. |
| F-EMP-5 | M-14, M-15, S-40, S-41, S-42, S-43, S-54, S-74 | Empty pool (B1), unknown/other-collective question (B3, partly S-54), all-or-nothing batch, day cap of 2, Madrid rollover as an app test (S-41 is a script check) not covered. S-40 and S-42 assume the engine, which is not wired. |
| F-EMP-6 | S-50, S-51, S-52, S-53 | Complete. Blocked `localStorage` not covered. |
| F-EMP-7 | none directly (M-12 notes the settings content) | `/privacitat` content and the link from settings not covered. |
| F-EMP-8 | none | "Has dit, hem fet" is not tested anywhere. |
| F-EMP-9 | M-12, M-13, S-30, S-31, S-32 | All pending; they assert absence today. |
| F-EMP-10 | S-24, S-25, S-26 | All pending. |
| F-HR-1 | M-1, M-2, M-3, S-4, S-70, S-71, S-73 | `next` return path for all paths covered by S-70; `/hr/need` and `/hr/review` redirects not covered. |
| F-HR-2 | M-4, M-5, S-60, S-61, S-62, S-63 | Form validation errors (B2 to B4, B5) and duration warning (B6) not covered. |
| F-HR-3 | M-6, M-7 | Guards on non-draft rows and "all discarded" state not covered. `aprovada_per` / `aprovada_el` not checked. |
| F-HR-4 | M-8, M-9, S-8 | One code per collective for an all-collectives need not checked. Empty states not covered. |
| F-HR-5 | M-16, M-18, M-19, S-1, S-3, S-7 | `?vs=` comparison and empty-state pages not covered. M-20b (insights) is in progress. |
| F-HR-6 | S-2, S-4, S-6 | Header and BOM / filename not asserted. |
| F-HR-7 | M-20, M-21 | Signal status buttons, 404 on bad id, and manager-visible signal filter not covered. |
| F-HR-8 | M-22 | Not-approved recommendation case and the employee-side badge not covered. |
| F-HR-9 | M-24, S-14 | B1 (stub keeps serving a closed need's questions) is a likely failing case. |
| F-HR-10 | none | "Com es calcula?" not tested. |
| F-MGR-1, F-MGR-2 | M-23, S-72 | S-72 expects scoping that is not built. 404 on unknown collective and the approved-only recommendation rule not covered. |
| F-PRIV-1 | S-5, S-6 | |
| F-PRIV-2 | S-1, S-2, S-3, S-6, S-7 | |
| F-PRIV-3 | S-8 | |
| F-PRIV-4 | S-71 | Deleted-account cookie covered only by F-EMP-3 B3 (not tested). |
| F-PRIV-5 | S-6 (e) | Log content not checked anywhere. |
| F-PRIV-6 | none | A repo scan for real data or secrets is not in the plan. |
| F-JOB-1 | M-17 | Idempotence (second run, same counts) not covered. |
| F-JOB-2 | S-40, S-42, M-20b | Blocked on wiring. |
| F-JOB-3 | section 1.2 setup | Demo stories checked by S-90. |
| F-JOB-4 | M-13 | Pending. |

### Gap list for the rework (flows or branches the plan does not cover)

Highest value first:

1. **Closed need still served (F-HR-9 B1).** M-24 asserts the questions stop. The stub does not filter on `necessitat.estat`. Likely a real failure, and a candidate bug to hand to Jan.
2. **"Has dit, hem fet" (F-EMP-8)** has no case, though it is the employee half of closing the loop (R-FLOW-8, R-U-3).
3. **Form validation in HR (F-HR-2 B2 to B6)** has no case: three exact error strings and the duration warning.
4. **Empty pool and day cap (F-EMP-5 B1, 2 a day).** Needed to prove "never more than 2 questions a day" before the engine arrives, then again after.
5. **Deleted account with live cookie (F-EMP-3 B3)**, **second use of a recovery code (F-EMP-4 step 4)**, **inactive code mid-flow (F-EMP-2 B5)**.
6. **Approver recording (F-HR-3).** Check `pregunta.aprovada_per` and `aprovada_el` after "Aprovar". The value is the constant `hr-demo`, so R-PRIV-10 stays partial; the requirements file says "not recorded", which is stale.
7. **Manager scope (S-72)** expects a restriction that does not exist. Mark as expected gap and test the actual behaviour (all collectives open) so the run does not report a false regression.
8. **Atomic batch in `POST /api/responses`**: a batch with one invalid item stores nothing.
9. **PII redaction forms** beyond one name, email and phone: DNI/NIE, IBAN, and the `redaccio_fallida` branch.
10. **`/privacitat` content** and the links to it from `/join/[codi]` and `/settings`.
11. **Methodology page (F-HR-10)** and the CSV header, BOM and filename (F-HR-6).
12. **Repo scan for secrets and real data (F-PRIV-6).**

Stale statements found while writing this file (not fixed here, outside the brief): `docs/requirements.md` says the approver is not recorded (it is stored as `hr-demo`); `docs/employee-pwa-spec.md` says the join code travels in the session (it travels in `?codi=`) and lists an empty state "Res més per avui" and a push toggle that do not exist (the shipped copy is "Avui ja has acabat"); `docs/e2e-test-plan.md` M-24 assumes closing a need removes its questions from the pool.
