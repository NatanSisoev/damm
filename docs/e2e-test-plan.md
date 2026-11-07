# End-to-end test plan

A manual runbook for the full loop, to follow after merging `jan/dev` with Natan's `main`, plus a catalogue of smaller scenarios. Written 2026-11-07, updated after `jan/dev` at `8376d54` (the engine, contracts C2 to C6, is merged). Routes, Catalan labels, commands and env var names were read from the code. Anything that does not exist yet is marked **pending (owner)**. Re-check the pending marks after every sync: Jan and Natan own the owner column.

Requirement IDs (R-FLOW-2a, R-PRIV-3, N-5 and so on) come from `docs/requirements.md`. Cite them in the results log.

The engine is in the tree as `@damm/engine` (`packages/engine`). A separate session is wiring it into the app (pool and responses through `createEngine`, `runEngineJob` after seed, scheduler in `apps/web/instrumentation.ts`, insight cards, engine alarms, alarm badge, manager scope). Steps that depend on that work are marked **in progress (engine integration)** and their expected behaviour is the pass criterion. Run them as soon as it lands.

## How to use this document

- Run section 1 once per clean state, then the main scenario (section 2) top to bottom. Each step has an action, an expected result and a pass/fail box.
- A step marked **pending** cannot pass yet. Mark it `N/A` in the log, not `fail`, and note the owner.
- Sections 3 and 4 are independent. Pick what the change touched.
- Section 5 is the log template. Copy it per run.

Pending items at a glance (as of the date above):

| Pending | Owner | Where it shows up |
|---|---|---|
| Push subscribe and send (`/api/push/*`, service-worker `push` handler, toggle in `/settings`) | Jan (backlog task 4, branch `claude/employee-polish-9c507b`) | M-12, M-13, S-30 to S-32 |
| Engine behind `GET /api/pool/next` and `POST /api/responses` (`createEngine({db, redact})`, contract C2) | In progress (engine integration session); engine itself is merged | M-13, M-15, S-40 to S-43 |
| `runEngineJob(db)` after seed, scheduler in `apps/web/instrumentation.ts` (C4, C5) | In progress (engine integration) | M-17 |
| `POST /api/jobs/run` and the old clustering and theme jobs (the engine job covers scores, insights and alarms; theme clustering of comments is not in the engine) | Open question for Natan | M-17, M-20 |
| Insight cards on `/hr/results`, engine alarms with ack, action_linked and resolved on the signals pages, alarm badge (C4, C5) | In progress (engine integration) | M-18, M-20, M-20b, S-90 |
| Manager scope for engine alarms and insights (viewer `{role:"manager", collectiuId}`); the `/manager` pages themselves are merged | In progress (engine integration) | M-23, S-72 |
| Change password, delete account, regenerate recovery code in `/settings` | Jan (branch `claude/employee-polish-9c507b`) | S-24 to S-26 |
| Need-AI repair loop and quality evaluation | Jan (branch `claude/need-ai-quality-e5b252`, unmerged) | S-63 |
| Helper that adds many answers for a new need | Nobody yet (suggest Jan, `packages/seed`) | M-16 |
| Who approved a recommendation (traceability, R-PRIV-10, N-11) | Natan (contract change) | No scenario until it exists |

## 1. Setup

### 1.1 Clean clone

```bash
git clone <repo-url> damm && cd damm
git switch main
pnpm install
cp .env.example .env
```

Fill `.env` by hand. Never paste values into this document, a ticket or a chat. Variable names (from `.env.example` and the code):

| Variable | Needed for | If empty |
|---|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | AI drafts, redraft, follow-up drafts | Drafts fall back to templates and the badge reads "Plantilla de reserva" |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push | Push cannot work (pending anyway) |
| `SESSION_SECRET` | Employee session cookie | Set it, or sessions are not stable across restarts |
| `HR_ACCESS_CODE` | HR gate on `/hr` | Empty turns the gate off. Set it for every run in this plan |
| `TEAMS_WEBHOOK_URL` | Real post of the Teams card | The Teams page shows the card and the "not configured" state only |
| `PUBLIC_BASE_URL` | Base of join links and QR (default `http://localhost:3000`). It is read by the code but is not listed in `.env.example`, see Findings | Links point to localhost |

### 1.2 Database

Three ways. A and B write `data/app.db` (override with `DB_PATH`); C writes `data/demo.db` and leaves `app.db` alone. Pick one per run.

```bash
# A. Fixture only: populated HR screens, no accounts, no join codes
pnpm --filter @damm/db run init

# B. Full seed: about 1,200 synthetic employees, 700 responses, 500 comments, 4 join codes
pnpm --filter @damm/db run init
pnpm --filter @damm/seed run seed

# C. Engine demo DB: 92 days of answers, planted stories, takes about 4 minutes. Writes data/demo.db
source ~/.claude/bin/heavy-gate.sh
pnpm --filter @damm/engine run demo
DB_PATH=data/demo.db pnpm dev
```

The main scenario needs B. C is only for S-90, and its join codes are `DEMO-FAB`, `DEMO-LOG`, `DEMO-COM`, `DEMO-OFI` (three-letter prefix of each collective name, so check `joincode` if one differs). Expected seed output ends with `employees=… accounts=… questions=… responses=… comments=…` and the line `Sub-threshold segments (collective x shift, n<10): 1 -> Logística/nit (n=6)`. Join codes after seed: `DAMM-FAB`, `DAMM-LOG`, `DAMM-COM`, `DAMM-OFI`. Optional: `pnpm --filter @damm/seed run comments` regenerates comments from templates, `-- --llm` uses the LLM (needs `LLM_*`).

After B the aggregate tables (`agregat`, `tema`, `senyal`, `recomanacio`) are filled by the seed's dashboard fixtures. They are rebuilt by the engine job (M-17). For the planted demo stories use the demo DB (path C below, scenario S-90).

### 1.3 Start the app

```bash
pnpm dev
```

Opens `http://localhost:3000`. In Claude Code, `.claude/launch.json` has the config `web`. Stop the server at the end of the run (Ctrl-C, or stop the preview). Builds and full test runs: start with `source ~/.claude/bin/heavy-gate.sh` (shared memory lock).

Checks before testing:

```bash
pnpm lint
pnpm check:anonymity
pnpm build
```

All three must pass. `pnpm check:anonymity` fails if HR code or `@damm/db/hr` touches raw responses or accounts, or if the analytics view exposes `compte_id`.

### 1.4 Tunnel for the phone (join links, QR, push)

A phone cannot reach `localhost`, and push needs public HTTPS.

1. Start a tunnel to port 3000 (ngrok or cloudflared; test on the venue network, some ISPs block Cloudflare IPs).
2. Put the tunnel URL in `PUBLIC_BASE_URL` in `.env`, restart `pnpm dev`.
3. Open `/hr/publish`. The yellow note ("Els enllaços i QR apunten a …") must be gone and the links and QR must carry the tunnel host.

LAN-only variant (no push): `PUBLIC_BASE_URL=http://<laptop-ip>:3000`, phone and laptop on the same Wi-Fi.

### 1.5 Test devices

| Device | Use | Notes |
|---|---|---|
| Android Chrome (current) | Main employee run, push, install prompt | Push works installed or not |
| iPhone, iOS 16.4 or later, Safari | PWA install, push | Push needs the PWA added to the home screen and a user tap for permission |
| iPhone without home-screen install | S-31 | Push must be explained, not broken |
| Desktop Chrome | HR side, desktop layout, DevTools offline | |
| Second browser profile or private window | Second account, wrong-password and rate-limit tests | Employee session and HR cookie are separate |

### 1.6 Reset between runs

| What | How |
|---|---|
| Database | Stop the server, `rm data/app.db`, repeat 1.2 |
| HR session | Delete cookie `hr_access` (path `/hr`; it lasts 12 hours) |
| Employee session | "Tanca la sessió" in `/settings`, or clear site data |
| Answer drafts | Local storage keys starting with `damm:draft:v1:` |
| Service worker and cache | DevTools, Application, Service Workers, Unregister; remove the PWA from the home screen |
| Rate limit | In memory, per username: restart the server |

Always write the commit (`git rev-parse --short HEAD`) in the log.

## 2. Main scenario: the full loop

Covers R-FLOW-1 to R-FLOW-8, R-CH-1, R-CH-5, N-7. Preconditions: sections 1.1 to 1.4 done, DB from path B, `HR_ACCESS_CODE` set, phone on the tunnel URL. HR works on desktop, the employee on the phone. 25 steps.

Alerts. **Employee side:** a push notification for a new question is **pending (Jan)** for subscribe and send. Until then the employee sees new questions by opening the app. **HR side:** the engine writes alarms into `senyal` (types `sharp_drop`, `sustained_decline`, `changepoint_cluster`, `polarisation`, `feble`, `low_confidence`, `improvement`, each with severity, audience and status; 7-day cooldown). The HR screens for them (signals pages with acknowledge, action linked and resolve, header alarm badge, insight cards) are **in progress (engine integration)**; M-18, M-20 and M-20b state the pass criteria. The older seeded "Senyals" list and "Nous resultats" strip on `/hr` exist today.

### Phase A. HR side

| # | Action | Expected | Req | P/F |
|---|---|---|---|---|
| M-1 | Open `/hr` on desktop | Redirect to `/hr-login?next=/hr`. Page "Portal de persones", text "Accés restringit a l'equip de persones." | R-X-3 | ☐ |
| M-2 | Enter a wrong code in "Codi d'accés", press "Entra" | Stays on the page with "Codi incorrecte." | | ☐ |
| M-3 | Enter the right code, press "Entra" | Lands on `/hr`. Nav shows "Inici", "Necessitats", "Enllaços i QR", "Resultats", "Recomanacions", "Com es calcula?" | | ☐ |
| M-4 | Go to "Necessitats". Open "Nova necessitat". Press the example "B · Logística des del mòbil" | Fields "Objectiu", "Context", "Què no s'ha de preguntar", "Col·lectiu" (Logística) and "Durada màxima per persona (segons)" (60) fill in | R-FLOW-1a to 1e | ☐ |
| M-5 | Press "Generar esborranys" | Button shows "Generant…" and "La IA està redactant les preguntes…". Then a card appears in state "Esborrany" with badge "Proposta de la IA" (or "Plantilla de reserva" if the LLM is down), 3 to 6 questions, estimated time "~N s de 60 s" | R-FLOW-2a to 2g | ☐ |
| M-6 | In the draft: edit one question ("Desar text"), move one with ↑ or ↓, press "Regenerar" on one, "Descartar" one, edit "Títol" and "Introducció" ("Desar títol i introducció") | Each change sticks after reload. If time exceeds 60 s a warning "Atenció: el temps estimat … supera la durada màxima" shows | R-FLOW-3a to 3c | ☐ |
| M-7 | Press "Aprovar" on every remaining question | Each moves to "Preguntes aprovades"; counter reads "N aprovades"; state becomes "Llesta per publicar" when none are left to review. Nothing is live before this | R-FLOW-3d, R-X-3, R-PRIV-7 | ☐ |
| M-8 | Press "Publicar amb enllaç i QR" | State "Publicada". A QR and the code `DAMM-LOG` with a link on the tunnel host appear on the card | R-FLOW-4a to 4c | ☐ |
| M-9 | Open "Enllaços i QR". For Logística: "Copia" the link, open "Cartell per imprimir" (new tab, A4 poster), open "Publica a Teams" | List shows four collectives with "comptes al col·lectiu" (a count under 10 reads "<10"). Poster prints cleanly. The Teams page shows the Adaptive Card preview "Escolta activa"; with `TEAMS_WEBHOOK_URL` set a post button works (do not post to a real channel during rehearsal) | R-FLOW-4b to 4d, N-1 | ☐ |

### Phase B. Employee side

| # | Action | Expected | Req | P/F |
|---|---|---|---|---|
| M-10 | On the phone open the join link (or scan the QR) | `/join/DAMM-LOG`: "Et donem la benvinguda a …", a "Col·lectiu" card showing Logística, "Continua", link "Com tractem les teves dades" | R-FLOW-5b, R-PRIV-5 | ☐ |
| M-11 | Press "Continua". On `/onboarding` fill "Nom d'usuari" (lowercase, 3 to 30 characters), "Contrasenya" (8 or more), "Repeteix la contrasenya", press "Crea el compte" | Next screen shows the one-time recovery code. Tick "L'he desat" to enable "Continua". No email or phone is asked anywhere | R-PRIV-13, R-PRIV-4 | ☐ |
| M-12 | Enable push (employee settings or install prompt) | **Pending (Jan).** Today `/settings` has only "Privadesa" and "Sessió" ("Tanca la sessió"); there is no push toggle. When built: permission prompt, subscription stored in its own table keyed by account, removed on logout | R-FLOW-5d, N-12 | ☐ N/A |
| M-13 | Trigger a notification for a new question | **Pending (Jan push, Natan engine).** Expected later: a push arrives within a minute of publish or at the next daily slot; tapping it opens the app at the question. Fallback today: reload the home page | R-FLOW-5d, R-FLOW-5c | ☐ N/A |
| M-14 | Open the home page and answer the day's questions | Heading "Carregant les preguntes d'avui…", then questions one at a time. Rate, yes/no or ranking as drafted. "Envia" or "Envia i continua". For an open question type a comment containing a fake name and a fake phone (for example "Truqueu al 600123456") | R-FLOW-5a, R-FLOW-6a | ☐ |
| M-15 | After the last question | "Avui ja has acabat" and "Tornem demà amb un parell de preguntes." Reloading gives the same batch all day and no repeats (the engine stores the day's batch in `assignment`). Order inside the batch: follow-up first, then the published HR need, then monitoring. The newly published Logística need must appear for a Logística account. A second `POST /api/responses` for the same question is refused (`already_answered`). **In progress (engine integration)**: the route is still the stub until the wiring lands | R-FLOW-5c, R-FLOW-5f | ☐ |

### Phase C. Enough answers, analysis, HR reads

| # | Action | Expected | Req | P/F |
|---|---|---|---|---|
| M-16 | Reach the minimum group of 10 | The seed already gives groups above 10 for every segment but Logística/nit (6 accounts, by design). So "n at least 10" for the new need has two routes. Route 1 (works today): judge suppression on the seeded periods in `/hr/results`. Route 2 (new need): create 10 accounts by hand with `DAMM-LOG` (private windows) and answer. A script that does this is **pending (nobody, suggest Jan in `packages/seed`)**. Until it exists, the new need's own question will show "Suprimit" in results, which is correct and counts as a pass for S-1 | R-PRIV-2, R-DATA-1 | ☐ |
| M-17 | Run the engine job | `pnpm --filter @damm/engine run job` (uses `DB_PATH`) prints a JSON report with counts for aggregates, insights and alarms and no error. Once the scheduler is wired (**in progress, engine integration**) it also runs by itself every 10 minutes inside `pnpm dev`; check the server log for a job line and reload `/hr/results`. Expected: `agregat`, `insight` and `senyal` update, segments under 10 stay suppressed, the LLM is not called by any dashboard request. Theme clustering of comments and `POST /api/jobs/run` are not part of the engine: **pending (Natan to confirm)** | R-FLOW-6b to 6e | ☐ |
| M-18 | Open "Resultats" | Header "Resultats"; KPI "Comptes actius", "Temes detectats", "Temes emergents", "Segments suprimits"; sections "Perfil per domini", "Representativitat", "Temes dels comentaris", "Tendències per domini", "Comptes per col·lectiu". Every figure carries its n. "Compara amb" switches the period (query `?vs=`) | R-FLOW-7a to 7f, R-CH-2 | ☐ |
| M-19 | Read "Representativitat" | Columns "Respostes", "Població", "Diferència"; "Per torn" shows night under-response; differences of 5 pp or more are marked. The Logística night group reads "Suprimit" | R-DIFF-1, R-BIAS-1, N-2 | ☐ |
| M-20 | Open `/hr` and "Recomanacions" (signals pages). Check the signals list. Open "Veure detall →" on one | Seeded signals (October emerging theme, Logística safety equipment and heat) show with "Estat del senyal:". **In progress (engine integration), pass criteria:** engine alarms are listed with severity and audience; HR can move one to acknowledged, action linked or resolved and the new state survives a reload; the engine never overwrites an acknowledged or action-linked alarm on the next job run; the header shows a badge with the open alarm count after a page load; Lideratge alarms are HR only | R-FLOW-7e, R-FLOW-6e, R-DIFF-3 | ☐ |
| M-20b | Insight cards on "Resultats" | **In progress (engine integration), pass criteria:** cards for domain state, top mover, polarisation, importance gap, trajectory mix, follow-up confirmation and segment gap (shift or manager) read from the `insight` table; a suppressed row shows no value; no card names a person or a group under 10 | R-FLOW-7, R-PRIV-2 | ☐ |
| M-21 | On a recommendation press "Aprovar" (or "Descartar") | Badge changes. Nothing is executed automatically. | R-FLOW-8a, 8c | ☐ |
| M-22 | On a signal press "Crear enquesta de seguiment" | Badge "Seguiment creat". You land on `/hr/needs` with a new need in "Esborrany" (AI drafted, nothing approved). Approve and publish it as in M-7 and M-8. On the employee home, the loop list "Has dit, hem fet" shows the approved action and the badge "Enquesta de seguiment en marxa" | R-FLOW-8b, 8d, N-5 | ☐ |

### Phase D. Manager and close

| # | Action | Expected | Req | P/F |
|---|---|---|---|---|
| M-23 | Manager opens `/manager` | "Vista de responsables" lists the collectives; `/manager/<collective>` shows that collective only, with suppression, behind the same HR gate. **In progress (engine integration), pass criteria:** the engine viewer is `{role:"manager", collectiuId}`, so only that collective's insights and only alarms with audience `hr_manager` appear; HR-only alarms (all Lideratge alarms) never show | R-U-3, N-8 | ☐ |
| M-24 | In "Necessitats" press "Tanca la necessitat" on the test need | State "Tancada". The employee side no longer receives its questions. Confirm via the "Tancades" filter count | R-FLOW-8c | ☐ |

That makes 25 steps (M-1 to M-24 plus M-20b). **M-12 and M-13 (push) are pending (Jan)**. **M-15, M-17, M-20, M-20b and M-23 are in progress (engine integration)** and ready to run when it lands. M-16 is partly pending (no helper for many answers).

## 3. Further scenarios

IDs are `S-n`. Steps are short; expected results are what a pass looks like.

### 3.1 Anonymity and suppression (R-PRIV-1, R-PRIV-2, R-X-2, R-DIFF-2)

| ID | Steps | Expected |
|---|---|---|
| S-1 | In `/hr/results` look at the Logística night segment (6 respondents in the seed) in every table and chart | Shown as "Suprimit" or "<10" everywhere: profile, representativeness, trends, themes. "Segments suprimits" counts it |
| S-2 | Press "Exporta CSV" (`/hr/results/export`). Open the file | The sub-10 segment has no value, only the suppression marker. No account id, username or free-text comment tied to a person |
| S-3 | Complementary suppression: if two segments sum to a total and one is hidden, the other must not allow subtraction | The remaining segment is also hidden or the total is not shown |
| S-4 | `curl` the export without the HR cookie: `curl -i http://localhost:3000/hr/results/export` | Redirect to `/hr-login`, no CSV (with the gate on) |
| S-5 | Run `bash scripts/security-demo.sh` | Plants a forbidden import in HR code, `pnpm lint` fails, `pnpm check:anonymity` fails, then cleans up and both pass. `git status` is clean afterwards |
| S-6 | Walk `docs/security-demo.md` steps (c), (d) and (e) | (c) suppression plus CSV, (d) the view `v_resposta_analitica` has no `compte_id`, (e) `scripts/security-demo-account.mts` shows scrypt hashes and the recovery code on a copy of the DB |
| S-7 | Look for any HR page that shows a username, account id or raw comment tied to one | None. "Cap resposta individual." is the stated rule on the results page |
| S-8 | Publish page counts | Account counts per collective only, never names; a count under 10 reads "<10" |

### 3.2 Join edge cases (R-FLOW-5b, R-PRIV-13)

| ID | Steps | Expected |
|---|---|---|
| S-10 | `/join`, type `dammfab`, "Continua" | The form trims, uppercases, turns spaces and underscores into a hyphen. A missing hyphen is **not** added (see Findings); expect "Codi no vàlid" today |
| S-11 | Type ` damm fab ` and `damm_fab` | Both become `DAMM-FAB` and show the welcome page |
| S-12 | Open `/join/damm-fab` (lowercase URL) | Works, the code is uppercased |
| S-13 | Open `/join/XXXX` | "Codi no vàlid" and "Torna a provar amb un altre codi" |
| S-14 | Close the need, then open its join link again | A closed need no longer receives questions. The code itself stays active if other needs use it; check that `/onboarding` still refuses a code with `actiu` false: "Aquest codi no és vàlid o ja no està actiu." |
| S-15 | Onboarding validation: username with capitals or 2 characters, existing username, password under 8, mismatched repeat | The exact errors from the Catalan strings listed in the app: "L'usuari ha de tenir entre 3 i 30 caràcters…", "Aquest nom d'usuari ja existeix. Prova'n un altre.", "La contrasenya ha de tenir almenys 8 caràcters.", "Les contrasenyes no coincideixen." |

### 3.3 Account lifecycle (R-PRIV-13, R-PRIV-4)

| ID | Steps | Expected |
|---|---|---|
| S-20 | Log in at `/login` with the right credentials | Home page with questions |
| S-21 | Wrong password | "Usuari o contrasenya incorrectes." (same text for a wrong username) |
| S-22 | Six wrong attempts for one username within 15 minutes | From the sixth: "Massa intents. Torna-ho a provar d'aquí a una estona." Limit is 5 per 15 minutes per username, in memory; restart resets it |
| S-23 | "He perdut la contrasenya": username, "Codi de recuperació", "Contrasenya nova", "Canvia la contrasenya" | Password changes, the old one stops working. A wrong code or username: "Usuari o codi de recuperació incorrectes." The code is single use |
| S-24 | Change password while logged in | **Pending (Jan).** No such control in `/settings` today |
| S-25 | Delete account | **Pending (Jan).** Expected: account and push subscription removed; past answers stay aggregated and unlinkable |
| S-26 | Regenerate recovery code | **Pending (Jan)** |
| S-27 | "Tanca la sessió" in `/settings` | Back to `/login`; home redirects to `/login` |

### 3.4 Pushes and permissions (R-FLOW-5d, N-12): all pending (Jan)

| ID | Steps | Expected |
|---|---|---|
| S-30 | Deny the push permission | App keeps working, no repeated nag, a way to enable later is explained |
| S-31 | iPhone, PWA not added to the home screen | A short explanation that push needs "Afegeix a la pantalla d'inici"; nothing breaks |
| S-32 | Log out | Subscription row deleted; no push after logout |

### 3.5 Question pacing (R-FLOW-5c, R-FLOW-5f, R-TENSION-1): engine is merged, wiring in progress (engine integration)

| ID | Steps | Expected |
|---|---|---|
| S-40 | Answer for several days (or move the clock in the engine tests) | About 2 questions a day, never the same question 4 days in a row |
| S-41 | Day rollover at midnight Europe/Madrid, including the DST changes | A new batch starts at Madrid midnight, not UTC. Today's check: `pnpm --filter @damm/db run madrid-check` |
| S-42 | An approved HR need versus the base pool | The approved need's questions are scheduled first |
| S-43 | Reload mid-day after answering | No duplicate question; `POST /api/responses` answers a repeat with 409 `ja_respost` |

### 3.6 Answer-flow resilience (R-FLOW-5a)

| ID | Steps | Expected |
|---|---|---|
| S-50 | Type a comment, switch DevTools to Offline, press "Envia" | "Sense connexió. La teva resposta continua aquí: torna-ho a provar quan tornis a tenir xarxa." Draft is kept |
| S-51 | Reload the page during an unsent answer | Draft restored from `damm:draft:v1:*`. After a successful send the draft is gone |
| S-52 | Server returns 500 on `POST /api/responses` | "No s'ha pogut enviar la resposta. La teva resposta continua aquí: torna-ho a provar." and the button "Torna-ho a provar" retries |
| S-53 | Open home with no network | "Sembla que no tens connexió. Comprova la xarxa i torna-ho a provar." or the offline page (`public/offline.html`) |
| S-54 | Direct API checks while logged in | `POST /api/responses` with bad question id gives 400 `pregunta_invalida`; wrong value 400 `valor_invalid`; missing required comment 400 `comentari_obligatori`; without a session 401 `no_autenticat` |

### 3.7 LLM down or slow (R-FLOW-2, R-X-3)

| ID | Steps | Expected |
|---|---|---|
| S-60 | Unset `LLM_API_KEY`, restart, create a need | Drafts appear anyway with the badge "Plantilla de reserva" and the tooltip "La IA no ha estat disponible: són preguntes de plantilla" |
| S-61 | Point `LLM_BASE_URL` at a dead host | Same fallback, no hung page. Note how long "Generant…" lasts and log it |
| S-62 | In either case | A person still has to press "Aprovar" for every question. Nothing is published |
| S-63 | Create a need with an exclusion ("Salaris") | No question about pay is shown; ones that touch it are dropped before display (R-FLOW-1e). Quality repair loop and bias checker: **pending (Jan, `claude/need-ai-quality-e5b252`; R-FLOW-3e, R-BIAS-4, N-10)** |

### 3.8 Access, manager scope, PII

| ID | Steps | Expected |
|---|---|---|
| S-70 | With `HR_ACCESS_CODE` set, open `/hr/results`, `/hr/publish`, `/hr/needs` with no cookie | Each redirects to `/hr-login?next=<path>`; after login you return to that path |
| S-71 | Employee session cannot open HR | The HR cookie is separate; an employee login does not unlock `/hr` |
| S-72 | Manager scope: `/manager/<other collective>` as a manager | **In progress (engine integration).** Expected: a manager sees only their own collective; engine alarms limited to audience `hr_manager`; other collectives refused or hidden |
| S-73 | With `HR_ACCESS_CODE` empty | The gate is off and `/hr` opens directly. Make sure the demo `.env` has a code |
| S-74 | PII redaction: submit a comment with a name, an email and a phone (9 to 15 digits) | Stored comment has them replaced; HR never sees the original. If redaction fails the API returns 500 `redaccio_fallida` and nothing is stored (R-PRIV-3). Check the stored text with the demo steps in `docs/security-demo.md` |

### 3.9 Layout, theme, accessibility, demo smoke

| ID | Steps | Expected |
|---|---|---|
| S-80 | Employee app at 375 px width (phone), HR at 1280 px and at tablet width | No horizontal scroll; tap targets are comfortable; HR nav scrolls horizontally on narrow screens |
| S-81 | Dark mode on the OS, and in browser DevTools | Both sides readable, no white flash, badges keep contrast |
| S-82 | Keyboard only through `/join`, `/onboarding`, `/login`, one answer | Visible focus, labels for every field, Enter submits, errors announced (alerts use `role="alert"`) |
| S-83 | Browser zoom 200 percent, screen reader on the answer screen | Content reflows; each question and option has a readable name |
| S-84 | Demo-day smoke test, 10 minutes | See below |
| S-90 | Planted demo stories (below) | Each story shows as the listed alarm or insight on the demo DB |

Planted demo stories (S-90). **In progress (engine integration)**: the HR screens must show what the engine already writes. Setup: build and open the demo DB (path C in 1.2), log in to `/hr`. First confirm the data without the UI:

```bash
sqlite3 data/demo.db "select tipus, severity, status, audience, collectiu_id, domini_id from senyal order by id desc limit 20"
```

Then check the pages:

| Story | Where | Expected on screen |
|---|---|---|
| Shift changes announced late, from 1 Oct | Fàbriques, Condicions | A critical `sharp_drop` alarm, a `top_mover` card, theme comments about shift changes |
| Heat and safety equipment, slow decline from mid-August | Logística, Condicions | `sustained_decline` (or `feble`) alarm, comments about heat and equipment |
| Supervisor view collapses from 14 Oct | Logística morning shift, Lideratge | `changepoint_cluster` (critical, HR only, not visible in `/manager`), `followup_confirmation` card |
| Team splits, mean unchanged, from 1 Oct | Oficines, Entorn i relacions | `polarisation` alarm and card |
| Managers answer more positively | everywhere | `segment_gap` card with dimension manager |
| Few night-shift accounts | Fàbriques and Logística night | Suppressed rows ("Suprimit"), no values, in cards and in the CSV export |

Also check: acknowledge one alarm, run `DB_PATH=data/demo.db pnpm --filter @damm/engine run job`, and confirm it stays acknowledged. The demo is deterministic, so the same seed gives the same database (`--seed` and `--days` change it; use `pnpm --filter @damm/engine run test` for the engine's own `demo.test.ts` check, with `source ~/.claude/bin/heavy-gate.sh` first).

Demo-day smoke test (S-84), in order, stop at the first failure:

1. `git rev-parse --short HEAD`; `rm data/app.db`; init and seed (1.2); `pnpm dev`. Note any red text in the log.
2. `/hr` gate: right code gets in (M-1 to M-3).
3. `/hr/results`: "Segments suprimits" is 1 and the Logística night row reads "Suprimit" (M-18, M-19).
4. Create example A, approve all, publish (M-4 to M-8). Count the minutes.
5. On the phone: scan the QR, create an account, save the recovery code, answer one question (M-10 to M-14).
6. `/hr/recommendations`: open the Logística signal, press "Crear enquesta de seguiment" (M-20, M-22).
7. `bash scripts/security-demo.sh` ends clean (S-5).
8. Stop the dev server and the tunnel.

## 4. Coverage map

| Requirement group | Covered by |
|---|---|
| R-FLOW-1 to 4 (need, drafts, approval, publish) | M-4 to M-9, S-60 to S-63 |
| R-FLOW-5 (answering, frequency, reminders) | M-10 to M-15, S-30 to S-43, S-50 to S-54 |
| R-FLOW-6 to 8 (analysis, dashboard, actions) | M-16 to M-22 |
| R-PRIV (anonymity, redaction, credentials) | S-1 to S-8, S-20 to S-27, S-74 |
| R-X-3, R-PRIV-7 (AI proposes, human decides) | M-7, M-21, S-62 |
| R-U-3 (managers) | M-23, S-72 |
| R-BIAS, R-DIFF | M-19, M-20, S-1 to S-3 |

## 5. Results log template

Copy one block per run.

```
Run date:           YYYY-MM-DD HH:MM (Europe/Madrid)
Commit:             <git rev-parse --short HEAD>   branch: <name>
Tester:             <name>
Devices:            <phone model, OS, browser> / <desktop browser>
DB path:            A (init only) / B (seed)       PUBLIC_BASE_URL host: <host only, no secrets>
LLM:                live / fallback                 HR gate: on / off
Build checks:       lint ☐  check:anonymity ☐  build ☐

Main scenario       P=pass F=fail N/A=pending
M-1  ☐  M-2  ☐  M-3  ☐  M-4  ☐  M-5  ☐  M-6  ☐  M-7  ☐  M-8  ☐
M-9  ☐  M-10 ☐  M-11 ☐  M-12 ☐  M-13 ☐  M-14 ☐  M-15 ☐  M-16 ☐
M-17 ☐  M-18 ☐  M-19 ☐  M-20 ☐  M-20b ☐ M-21 ☐  M-22 ☐  M-23 ☐  M-24 ☐

Further scenarios run: S-__, S-__, ...   (list the IDs with result)

Failures (ID, what happened, screenshot or log path, owner):
-

Notes (timings, odd behaviour, ideas):
-
```

## 6. Findings while writing this plan

These are things seen in the code or docs while verifying, left as is on purpose. None has been fixed here.

1. `goToJoinAction` (`apps/web/app/join/actions.ts`) says it normalises a code typed without a hyphen, but by code reading it does not: `dammfab` is not turned into `DAMM-FAB`. See S-10.
2. `/settings` has no push toggle, change password, delete account or recovery-code regeneration. See S-24 to S-26 and M-12.
3. There is still no `POST /api/jobs/run` and no comment-theme clustering job in the tree. The engine job is merged (`pnpm --filter @damm/engine run job`) but covers scores, insights and alarms only. See M-17.
4. `PUBLIC_BASE_URL` is used by the code and the docs but is missing from `.env.example`.
5. `docs/demo-script.md` and parts of `docs/requirements.md` still refer to older labels and to work as pending that has since merged, for example the separate "Esborranys pendents" list and `jan/pwa-answer`. The needs page was unified into `/hr/needs` in commit `0373ce2`. Re-read the demo script before using it as a reference for labels; this plan uses the labels from the current code.
7. No helper exists to add many synthetic answers for a newly published need, so reaching n at least 10 for a fresh need needs ten manual accounts. See M-16.
