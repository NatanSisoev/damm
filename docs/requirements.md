# Requirements

The single checklist we compare the build against. Sources:
- **D**: the challenge deck (`Repte-Estrella-Damm-UAB-THE-HACK-2026.pdf`), cited as D-S<slide>.
- **G**: the participant guide (`20261102 - Guia participants.pdf`), cited as G-§<section>.
- **A**: our own product decisions in `AGENTS.md`.

Where the guide is stricter or more detailed than the deck, the guide wins.

## How to use this file

- Every requirement has an ID. Cite the ID in commits, PRs and session briefs, for example "closes R-FLOW-2c".
- Update the status when work merges into `jan/dev`, not when it is written on a branch.
- **Must** means it is in the challenge's minimum, its golden rules or its exclusion criteria. **Should** means the evaluators name it or it clearly scores. Nice-to-haves are in their own section at the end.
- Before a PR or a demo checkpoint, walk the "Done means" column of every Must.

Status legend:
- `done`: merged into `jan/dev`, verified.
- `partial`: some of it works; the gap is in the notes.
- `wip`: a session is building it now.
- `missing`: nobody has built it.
- `blocked`: waiting on Natan's area (engine, AI, analysis, schema).

Status snapshot: 7 Nov 2026, evening. `packages/engine`, `packages/ai` and `packages/analysis` do not exist on `jan/dev` or `origin/natan/dev` yet. Natan's engine spec is on `origin/natan/engine-spec`.

---

## 0. Exclusion criteria (any one of these disqualifies)

G-§9: "Criteris excloents". These outrank everything else.

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-X-1 | No real personal data anywhere: code, seed, DB, slides, screenshots, LLM prompts | done | Seed is synthetic (`packages/seed`). Re-check slide screenshots before the deck. |
| R-X-2 | No identifiable individual results on any screen or export | done | n≥10 suppression plus complementary suppression (task 17), CSV export with `suprimit` (task 8). |
| R-X-3 | Human control: nothing the AI proposes takes effect without a person approving it | done | Questions need `aprovada`; recommendations need approval. Re-verify once Natan's AI calls land. Gap: the approver of a recommendation is not recorded (needs `recomanacio.aprovada_per/aprovada_el`); `/hr/*` now sits behind `HR_ACCESS_CODE`. |
| R-X-4 | No tokens or secrets exposed in code, git history, slides or screenshots | partial | `.env` is gitignored and `.env.example` has empty values. Still to do: a history scan (`git log -p \| grep -iE "key\|token\|secret"`) before the PR, and a check of the slides and screenshots. |

## 1. Challenge statement and principle

| ID | Requirement | Source | Status | Evidence / gap |
|----|-------------|--------|--------|----------------|
| R-CH-1 | An AI-based active-listening platform that creates climate micro-surveys adapted to each collective **and moment** | D-S12, G-§3 | partial | Collective adaptation exists in the seeded pool. "Moment" (timing) depends on the engine (blocked). |
| R-CH-2 | Representative participation **without saturating** people | D-S11, G-§3 | partial | About 2 questions a day and representativeness per collective are in place. The anti-saturation rules live in the engine (blocked). |
| R-CH-3 | Answers become insights **and actions** automatically | G-§3 | partial | Signals, themes and recommendations are shown. They are produced by the seed, not by an analysis job (blocked). |
| R-CH-4 | Anonymity and privacy guaranteed at all times | D-S12, G-§3 | done | See section 6. |
| R-CH-5 | **One continuous flow**, not three projects. All parts present; going deeper on one is fine | G-§3, G-§10 FAQ | partial | Every step has a screen. Steps 2 (real AI) and 6 (real analysis) are blocked. |
| R-CH-6 | It must not feel like "one more survey". It is a new way to listen, understand and act | D-S19, G-§1 | partial | Continuous pool, swipe/ranking formats and the "Has dit, hem fet" loop on the employee home carry this. Make it explicit in the pitch. |

## 2. Users

G-§3.2.

| ID | User | What they need | Status | Evidence / gap |
|----|------|----------------|--------|----------------|
| R-U-1 | **Primary**: People/HR person who wants to understand a concrete situation and act | Need → drafts → approval → publish → results → recommendation | partial | `/hr/*`. Real AI and analysis are blocked. |
| R-U-2 | **Respondent**: anyone at Damm (plant, logistics, sales, office, manager), little time, on a phone | Fast mobile answering, anonymity they can believe | done | PWA onboarding, answering, done state (2 a day max, day follows Europe/Madrid), in-progress answers kept on the device across reloads, loading and retry states, `/privacitat` and a shared mobile shell (44px targets). Push (task 4) still open. |
| R-U-3 | **Secondary**: team leads and management who receive aggregated results and recommendations | done (collective level) | `/manager` and `/manager/[collectiu]` (`apps/web/app/manager`): read-only, one collective, behind `HR_ACCESS_CODE`. Shows domain profile, trend, representativeness, company-wide themes, `hr_manager` signals and HR-approved recommendations only; `hr` (Lideratge) signals never shown; segments under 10 suppressed. No team concept, so no finer scope (N-6, N-8). | No team concept exists (only collective, centre type and shift), so a manager view carries re-identification risk. Proposal: collective-level read-only share or the Teams card (`/hr/publish/[codi]/teams`). See N-6. |

## 3. Functional flow (minimum)

G-§4 is the authoritative list ("Tots els equips han de cobrir aquest recorregut"). D-S13 is the same flow at a higher level. All Must.

### R-FLOW-1 Define the need
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-1a | HR describes the objective in natural language | done | `/hr/needs`, `text_nl` |
| R-FLOW-1b | Target collective | done | Collective select, or "Tots" |
| R-FLOW-1c | Context | partial | Only free text. There is no separate context field. |
| R-FLOW-1d | Maximum duration | done | `durada_max_s`, default 120 s |
| R-FLOW-1e | **What must not be asked** ("què no s'ha de preguntar") | partial | The column exists (`necessitat.exclusions`, on main). The need form, the AI prompt and the quality checker (19) do not use it yet: in progress on the need-AI branch. |

### R-FLOW-2 Generate the survey with AI
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-2a | Proposes a **title** | done | `draftSurvey` in `packages/ai` (ornith, thinking off, JSON mode, about 3.4 s); editable in review |
| R-FLOW-2b | Proposes an **introduction** | done | `draftSurvey`; editable in review |
| R-FLOW-2c | **3 to 6 questions** | done | LLM drafts from the need, context and exclusions; template fallback flagged "Plantilla de reserva". Quality eval in progress (`need-ai-quality` branch). |
| R-FLOW-2d | **Answer type** per question | done | The AI picks among `scale5`, `scale10`, `yes_no`, `ranking`, `open` (C2 English types); scale questions carry their own end labels. |
| R-FLOW-2e | **Conditional logic** | missing | Not in the schema or the UI. Minimal version: "if score ≤ 2, ask the open follow-up". |
| R-FLOW-2f | **Estimated time** | done | `estimateSeconds` per question and per draft; review warns when it exceeds R-FLOW-1d. |
| R-FLOW-2g | Adapted to the collective in **tone, length and channel** | partial | The prompt takes the collective and a warm tone; channel adaptation not done. |

### R-FLOW-3 Human validation
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-3a | HR can **edit** each question | done | `editQuestionAction` |
| R-FLOW-3b | HR can **delete** each question | done | `discardQuestionAction` |
| R-FLOW-3c | HR can **reorder** questions | done | `moveDraftAction` with `pregunta.ordre` (C3 draft column, contract entry pending). |
| R-FLOW-3d | HR **approves**. The AI never publishes without approval | done | `approveQuestionAction`; only `aprovada` enters the pool. |
| R-FLOW-3e | Quality warnings before approval (bias in the wording, D-S9 #4) | missing | Task 19 (ready) |

### R-FLOW-4 Publish
The guide says "Publicar a Typeform". AGENTS.md decides to ignore Typeform: the app is the channel. The equivalent requirement is below. **Explain this choice on the pitch** (we own the anonymity boundary end to end).
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-4a | Publishing makes the approved questions live | done | `publishNecessitat`, pool |
| R-FLOW-4b | A shareable **link** | done | `/hr/publish`, join URL per collective |
| R-FLOW-4c | A **QR** | done | Server-side SVG plus a printable A4 poster |
| R-FLOW-4d | Publish via **API** / M365 integration (D-S13) | done | `/hr/publish/[codi]/teams`: Adaptive Card preview, copyable JSON, optional send to `TEAMS_WEBHOOK_URL`. The webhook send is not yet tested against a real Teams channel. |

### R-FLOW-5 Participation
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-5a | Mobile **and PC** | done | Responsive PWA |
| R-FLOW-5b | QR access | done | `/join/[codi]` |
| R-FLOW-5c | **Frequency** strategy (about 2 a day, no repeats 4 days in a row) | blocked | Pool stub today; engine is Natan's |
| R-FLOW-5d | **Reminders** | missing | Push is task 4 (ready). Needs HTTPS (task 9). |
| R-FLOW-5e | **Representativeness control** while collecting (warn when a group is under-sampled) | partial | Shown on results. The engine now raises a `baixa_participacio` alarm (C7); banner pending. Oversampling is still blocked. |
| R-FLOW-5f | Does not saturate anyone | blocked | Engine rules |

### R-FLOW-6 Collect and analyse
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-6a | Read the responses (through the API) | done | `POST /api/responses` → `resposta` |
| R-FLOW-6b | **Group comments by theme** | partial | `tema`/`comentari_tema` from the seed. Real clustering is blocked. |
| R-FLOW-6c | **Summarise** | partial | Theme labels only. No per-theme summary text. |
| R-FLOW-6d | Detect **trends** | done | Trends with the change rule (task 17) |
| R-FLOW-6e | Detect **weak signals** | partial | `senyal` seeded, drilldown done (16). Detection is blocked. |
| R-FLOW-6f | **Compare collectives or periods** | done | Results by collective and period |

### R-FLOW-7 Visualise (simple dashboard)
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-7a | Participation | done | HR home KPI, results |
| R-FLOW-7b | Representativeness | done | Against the 1,200 population |
| R-FLOW-7c | Main themes | done | Results / signals |
| R-FLOW-7d | Evolution | done | Trends |
| R-FLOW-7e | **Alerts** | done | Signals on the home page and the signal list |
| R-FLOW-7f | **Sample size** on every figure | done | n plus a precision band (task 17) |

### R-FLOW-8 Recommend and close the loop
| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-FLOW-8a | Proposes **concrete actions** | partial | `recomanacio` seeded. Generation is blocked. |
| R-FLOW-8b | Proposes a **new follow-up micro-survey** | done | `createDraftedFollowUp`: need for the signal's collective, AI-drafted questions, human review |
| R-FLOW-8c | Recommendations are proposals, never automatic decisions | done | Approve or discard |
| R-FLOW-8d | Results go back to the people who answered | done | Employee home lists approved actions for their collective (`approvedActionsForCompte`, n≥10 only) with period and follow-up badge |

## 4. Acceptance scenarios

At least one must run end to end in the final demo; ideally all three (G-§5).

### R-SC-A Organisational change (and the D-S14 worked example)
"Vull entendre com està afectant el nou sistema de torns a planta, amb una consulta de menys de 2 minuts."

| Step | Expected | Status |
|------|----------|--------|
| A1 | HR types the need, picks Fàbriques, sets ≤ 120 s | done |
| A2 | The AI proposes **4 short questions with a warm tone** | blocked (seeded drafts stand in) |
| A3 | HR **edits one** and approves | done |
| A4 | Publish **with a QR for the plant** | done |
| A5 | The system **warns that the night shift responds little** | partial: engine emits a `baixa_participacio` alarm per collective × shift (C7); the explicit banner is Jan's |
| A6 | Comments grouped into **communication** and **breaks** | partial: seeded October theme |
| A7 | **2 actions** recommended plus a follow-up survey | partial: seeded recommendations; follow-up done |
| A8 | Answers whether the change was understood, what difficulties it causes and what to reinforce (G-§5 A) | partial: depends on A2 question quality |

### R-SC-B Plant or logistics collective
| Step | Expected | Status |
|------|----------|--------|
| B1 | Mobile experience, reached by QR, very short | done |
| B2 | No computer, little email access, so no email-based flow | done (join code plus username, no email) |
| B3 | A control that **warns when the sample is not representative** | partial: engine emits `baixa_participacio` (C7); show it as an explicit warning banner per need/collective |

### R-SC-C Large volume of comments
| Step | Expected | Status |
|------|----------|--------|
| C1 | About 500 open comments on wellbeing, leadership, communication, tools, organisation and development | done (seed) |
| C2 | Group them | partial (seeded themes) |
| C3 | Summarise them | missing (no summary text per theme) |
| C4 | Detect **emerging themes compared with a previous period** | partial (October theme seeded; the "new vs previous" view needs checking) |
| C5 | Propose areas for action | partial |
| C6 | **Explain the limits of the analysis** | missing: task 18 (methodology page) plus a short per-screen note |

## 5. Bias and analysis-difficulty coverage

D-S9 and D-S10. Each needs a named mitigation we can point at in the demo. "AI doesn't remove bias; it can detect it or amplify it."

### R-BIAS (D-S9)
| ID | Bias | Our mitigation | Status |
|----|------|----------------|--------|
| R-BIAS-1 | Coverage | Representativeness against the 1,200 synthetic population, per collective and shift | done |
| R-BIAS-2 | Non-response | Night shift under-response shown and alarmed (`baixa_participacio`, C7); engine oversampling of under-represented groups | partial (oversampling blocked) |
| R-BIAS-3 | Self-selection | Push-driven continuous micro-questions rather than opt-in surveys; representativeness weighting | partial (push task 4) |
| R-BIAS-4 | Wording | Question-quality checker (19); human approval | missing |
| R-BIAS-5 | Social desirability | Anonymity promise plus `/privacitat`; **show the manager positivity gap** (seeded `MANAGER_BONUS`) | missing: the manager segment is not shown anywhere (option B, not started) |
| R-BIAS-6 | Timing | The engine spreads questions over days and shifts; trend change rule | partial |
| R-BIAS-7 | Segmentation (averages hide collectives) | Always broken down by collective, domain radar per collective | done |
| R-BIAS-8 | Analysis (confirmation bias) | Change rule, precision bands, "correlation is not cause" note, human validation of signals | partial (methodology page `/hr/methodology` pending merge, audit item 19) |

### R-DIFF (D-S10)
| ID | Difficulty | Our answer | Status |
|----|-----------|------------|--------|
| R-DIFF-1 | Representativeness: who is missing? | Gap per collective and shift | done |
| R-DIFF-2 | Confidentiality: segment without identifying | n≥10 plus complementary suppression | done |
| R-DIFF-3 | Causality | Never present correlations as causes; wording on signals and methodology | partial (needs 18) |
| R-DIFF-4 | Prioritisation (frequent ≠ most relevant) | Signals ranked by effect and n, not by volume | blocked (signal criteria, Natan) |
| R-DIFF-5 | Comparability | Same item IDs across periods; change rule only on the same question | done |
| R-DIFF-6 | Context: what event explains a change? | Need text and recommendations attached to the signal timeline | partial (16 timeline) |
| R-DIFF-7 | Open text (languages, irony, several themes) | LLM clustering, multi-theme `comentari_tema` | blocked |
| R-DIFF-8 | Actionability: an insight needs an owner and a plan | Recommendation with an approval, follow-up survey | partial (no owner field) |

### R-TENSION (D-S11)
| ID | Tension | Status |
|----|---------|--------|
| R-TENSION-1 | Participation: representative without saturating | partial (engine) |
| R-TENSION-2 | Personalisation: relevant per collective without designing dozens of surveys by hand | partial (AI blocked) |
| R-TENSION-3 | Analysis and action: decide earlier | partial |

## 6. Privacy, trust and responsible use

G-§8 principles, D-S16 trust pillars and D-S17 golden rules, merged. All Must.

| ID | Requirement | Source | Status | Evidence / gap |
|----|-------------|--------|--------|----------------|
| R-PRIV-1 | Results always aggregated, never individual answers | G-§8, D-S17 | done | HR imports only `@damm/db/hr`; lint rule plus `check:anonymity` |
| R-PRIV-2 | Minimum group threshold (guide: 5 to 10; ours: **10**) everywhere, exports included | G-§8, A | done | Plus complementary suppression. Join-code account counts under 10 show "<10"; CSV export carries a suppression note. |
| R-PRIV-3 | Automatic detection and removal of identifying data in comments (names, emails, phones) | G-§8 | done | `redactPii` regex before storage. LLM pass is optional (Natan). |
| R-PRIV-4 | No individual profile or inference about specific people; cannot be used to evaluate anyone | G-§8, D-S16 "No vigilància" | done | Trajectories exist only inside the analysis layer; the admin sees counts only. |
| R-PRIV-5 | **Transparency to respondents**: what the survey is for and how data is handled | G-§8, D-S16 | done | `/privacitat`: what we collect, what HR sees (n≥10), what we never do, comment redaction, session and account |
| R-PRIV-6 | **Explainability**: sample size, confidence and limits of the analysis; correlations are not causes | G-§8 | partial | n and precision bands done; methodology page `/hr/methodology` built on `claude/audit-p2-methodology-8b92a4` (audit item 19), status unchanged until merge |
| R-PRIV-7 | Human control: HR validates surveys and recommendations before acting | G-§8, D-S16, D-S17 | done | |
| R-PRIV-8 | **Minimisation and expiry**: keep only what is needed, for as long as needed | G-§8 | partial | Minimisation done (no email or phone, redacted comments only). **No retention or expiry rule exists.** Add a documented retention period and a purge script or job. |
| R-PRIV-9 | Equity: check coverage and results per collective | D-S16 | done | |
| R-PRIV-10 | **Traceability**: record sources, criteria and decisions | D-S16 | blocked | Task 21 needs the `decisio` table and `font` fields (Natan) |
| R-PRIV-11 | Synthetic data only | D-S17, G-§6 | done | |
| R-PRIV-12 | Zero secrets | D-S17, G-§7 | partial | See R-X-4 |
| R-PRIV-13 | Credentials salted and hashed; recovery by one-time code | A | done | scrypt |

## 7. Synthetic data

G-§6.

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R-DATA-1 | 300 to 1,000 responses | done | About 700 |
| R-DATA-2 | At least two periods | done | Aug, Sep, Oct 2026 |
| R-DATA-3 | Several collectives with **uneven** participation | done | Night shift ×0.6, one sub-threshold group |
| R-DATA-4 | Deliberate biases the solution then detects: low-response groups, emerging themes, changes between periods | done | October theme, Logística weak signal, manager bias |
| R-DATA-5 | Response id random, never linked to a person | done | |
| R-DATA-6 | Broad categories, not small teams; no identifiable centres | done | 4 collectives, centre *type* only |
| R-DATA-7 | **Channel** field to analyse participation by channel (Mòbil-QR / Correu / Teams) | partial | `canal` is stored (`app`, `mobil_qr`). Not shown anywhere; no Teams value. |
| R-DATA-8 | Realistic open comments with noise and typos | done | About 500, generated once and committed |
| R-DATA-9 | Optional hidden true theme label to validate the classification | done | `resposta_seed`. Add a precision figure to the pitch once real clustering runs. |

## 8. Collectives and dimensions

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| R-DOM-1 | 4 collectives: Fàbriques, Logística, Comercial, Oficines (manager is a role flag) | D-S2, A | done |
| R-DOM-2 | 6 dimensions: Benestar, Lideratge, Desenvolupament, Cultura i pertinença, Entorn i relacions, Condicions i organització | D-S5 | done |
| R-DOM-3 | "Not every reality needs the same questions": a different item subset per collective and domain | D-S5 | done (seed) |
| R-DOM-4 | Formats suited to each reality (little screen time on the plant, mobile in sales) | D-S2 | partial (types exist; selection is in the engine) |
| R-DOM-5 | Link the company initiatives (conciliació, formació, igualtat, seguretat i salut, comunicació i lideratge) to domains so a result answers "is this initiative working?" | D-S3, D-S4 | missing (a mapping table and a filter would do) |

## 9. Delivery checklist

G-§11 and G-§7. All Must before submitting.

| ID | Item | Status |
|----|------|--------|
| R-DEL-1 | The flow works from need to recommendation | partial (works on seeded AI and analysis) |
| R-DEL-2 | Human validation before publishing | done |
| R-DEL-3 | Data is 100% synthetic | done |
| R-DEL-4 | Minimum threshold and aggregated results only | done |
| R-DEL-5 | No token or secret in the code or the slides | partial (history and slide scan pending) |
| R-DEL-6 | README and `.env.example` included | done (check that the README covers setup from a clean clone) |
| R-DEL-7 | Security demo (video or screenshots) prepared | partial (`docs/security-demo.md` exists; recording is with the deck work, after 8 Nov 09:00) |
| R-DEL-8 | A fallback video or screenshots in case the live demo fails | missing (deck work, after 8 Nov 09:00) |
| R-DEL-9 | `main` builds and runs from a clean clone | partial (task 10 PR pending) |

## 10. Evaluation criteria and where we score

G-§9 wording, D-S18 weights. Use this to decide what to build next: weight × gap.

| Weight | Criterion | What scores it | Weakest point now |
|--------|-----------|----------------|-------------------|
| 20% | Fit to the problem and value for people | Full cycle, closing the loop to employees, anonymity people believe | Push (4); manager view (R-U-3) |
| 15% | Prototype quality and usability | Polished HR and mobile flows, no dead ends | Push (4), reorder (R-FLOW-3c) |
| 15% | Useful, justified use of AI | Real drafts, clustering, summaries, recommendations, each with a human gate | All AI calls blocked on Natan |
| 15% | Privacy, anonymity, responsible use | n≥10, complementary suppression, redaction, lint guard, transparency | Traceability (21), retention (R-PRIV-8) |
| 10% | Representativeness and inclusion of all collectives | Gap vs population, night shift, no-computer path | Explicit warning (R-SC-B3), kiosk (N-3) |
| 10% | Analysis and insight quality | Signals with effect size and n, change rule, emerging vs previous period, limits explained | Real analysis job, methodology (18), summaries |
| 10% | Future M365 integrations | Teams card and webhook, a credible Graph/Entra roadmap | Real webhook test, plus a roadmap slide |
| 5% | Presentation clarity and evolution | Deck, future-evolution slide | After 8 Nov 09:00 |

---

## Nice-to-haves

Bonus items named by the guide (G-§4 "Bonus") and the deck (D-S18), then our own. Ordered by value per hour.

| ID | Item | Source | Why it scores | Status | Notes |
|----|------|--------|---------------|--------|-------|
| N-1 | **Teams / M365 integration** | G bonus, D-S18, 10% criterion | Hits a weighted criterion directly | partial | Adaptive Card, optional webhook, `docs/teams-integration.md`. Roadmap: Graph for audience, Entra SSO without identity leakage. |
| N-2 | **Representativeness indicator** | G bonus | Already built; name it as the bonus in the pitch | done | |
| N-3 | **Experience for people without a computer** | G bonus, D-S18 | Plant and logistics, scenario B | partial | QR plus mobile done. Add a **kiosk mode**: shared tablet, no account, one answer per session with a rate limit, own `canal` value. |
| N-4 | **Actionable wellbeing recommendations** | G bonus, D-S18 | Value for people | partial | Recommendations exist; make them concrete (owner, deadline, which initiative from D-S3). |
| N-5 | **Dynamic follow-up questions** | G bonus | Ties to R-FLOW-2e | missing | A low score triggers an open "why?" question in the same session. |
| N-6 | **Multi-language** | G bonus | Catalan, Spanish, English at minimum; plant staff | missing | i18n on the employee app first; the AI translates approved questions with human review. |
| N-7 | **Full cycle in one platform** | D-S18 | Already our architecture | done | Say it explicitly. |
| N-8 | Manager segment in HR results (social desirability, R-BIAS-5) | ours | Shows we detect a seeded bias | missing | "Option B". Needs a db query on `es_manager` (Natan's area: flag). Only above n≥10. |
| N-9 | Methodology page "Com calculem" | ours | Explainability, scenario C6 | missing | Task 18, ready |
| N-10 | Question-quality checker | ours | Wording bias, R-BIAS-4 | missing | Task 19, ready |
| N-11 | Decision audit log and AI provenance | ours | Traceability, R-PRIV-10 | blocked | Task 21 |
| N-12 | Installable PWA plus daily push reminder | ours | Reminders R-FLOW-5d, participation | partial | Installable: manifest, icons, offline page, service worker (push stub). Push subscribe and send still open (task 4), then the tunnel (9). |
| N-13 | Participation by channel chart | G-§6.2 | Uses the `canal` field we already store | missing | Small: one aggregate by `canal` with suppression. |
| N-14 | Initiative ↔ domain mapping | D-S3 | Turns results into "is our policy working?" | missing | R-DOM-5 |
| N-15 | Retention and purge job | G-§8 | Closes R-PRIV-8 | missing | Document the period; a script deletes old `resposta` rows after aggregation. |
| N-16 | Accuracy of the theme classifier against `resposta_seed` | G-§6.2 | A number that proves analysis quality | blocked | After the real clustering lands. |
| N-17 | Demo reset and presenter mode | ours | Demo reliability | deferred | Task 15, after 8 Nov 09:00 |
| N-18 | Question reordering and conditional logic in review | G-§4 | Closes R-FLOW-3c and R-FLOW-2e | missing | Needs an `ordre` field (shared contract). |

## Gaps that need Natan or a contract change

Everything flagged `blocked`, or `missing` with a schema touch, collected so it can go in one message:
- `packages/ai`: title, intro, 3 to 6 questions, types, conditional logic, tone per collective, honouring "what not to ask" (R-FLOW-2*).
- `packages/analysis`: clustering, summaries per theme, emerging vs previous period, signal criteria with effect size and n (R-FLOW-6*, R-DIFF-4, R-DIFF-7).
- `packages/engine`: frequency, anti-saturation, oversampling of under-represented groups (R-FLOW-5c/e/f).
- Schema: a question order field (R-FLOW-3c), conditional logic (R-FLOW-2e), the `decisio` table and `font` fields (R-PRIV-10), an owner on `recomanacio` (R-DIFF-8), a manager-segment aggregate (N-8).
