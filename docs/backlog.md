# Backlog

Spawn order for the Jan-side tasks. Each task gets one session, one `jan/<task>` branch from `jan/dev`, and touches only the files listed. The coordinating session reviews, merges into `jan/dev` with `--no-ff` and pushes. Sessions never merge or push.

Limits: at most 3 sessions running at once, and at most 2 of them running builds or tests (`heavy`). Builds start with `source ~/.claude/bin/heavy-gate.sh`.

Status: `running`, `ready` (can start now), `blocked` (waiting on a dependency), `done`.

## Now

| # | Task | Branch | Status | Load |
|---|------|--------|--------|------|
| 0 | Anonymity enforcement (lint rule, check script) | `jan/anon-guard` | done | heavy |
| 0 | Seed data (`packages/seed`) | `jan/seed` | done | heavy |
| 1 | Frontend refinement, HR side (domain radar, Magenta Desks-style restyle) | `jan/ui` | done | light |
| 2 | PWA accounts and onboarding | `jan/pwa-auth` | done | heavy |
| 3 | PWA answer flow | `jan/pwa-answer` | done | heavy |
| 4 | Installable PWA and push | `jan/pwa-push` | ready | heavy |
| 5 | Employee UI refinement | `jan/ui-employee` | ready | light |
| 6 | Security demo | `jan/security-demo` | done | light |
| 7 | Demo script and slide notes | `jan/demo-script` | done | light |
| 8 | HR CSV export with suppression | `jan/hr-export` | done | light |
| 10 | `jan/dev` → `main` PR | coordinating session | ready | light |
| 12 | HR home overview | `jan/hr-home` | done | light |
| 13 | Publish page: join link, QR and print poster | `jan/publish-qr` | done | light |
| 14 | Pitch deck | `jan/deck` | deferred to 8 Nov 9:00 | light |
| 15 | Demo reset and presenter mode | `jan/demo-reset` | deferred to 8 Nov 9:00 | heavy |
| 16 | Signal drilldown and follow-up loop view | `jan/signals` | running | light |
| 17 | Statistical rigour: complementary suppression, precision, change rule | `jan/rigour` | running | light |
| 18 | Methodology page ("Com calculem") | `jan/methodology` | ready | light |
| 19 | Question-quality checker on drafts | `jan/draft-check` | ready | light |
| 20 | "Has dit, hem fet": results back to employees | `jan/closing-loop` | ready | light |
| 21 | Decision audit log and AI provenance | `jan/audit-log` | blocked on schema (Natan) | light |

Order for the next free slots: 18, 20, 19, then 5, then 4. Pitch deck and demo work (14, 15) go last and are not raised before 8 Nov 9:00.

All of the done rows are merged into `jan/dev` and pushed (lint, `check:anonymity`, seed and build pass). Not yet verified: the production refusal when `SESSION_SECRET` is unset.

## Next up

### 2. PWA accounts and onboarding: `jan/pwa-auth` (done)
Spec: `docs/employee-pwa-spec.md`, build steps 1-2.
- Files: `apps/web/app/onboarding/**`, `apps/web/app/login/**`, `apps/web/app/settings/**`, `apps/web/lib/session.ts`, `packages/db/src/employee-repository.ts`, `packages/db/src/employee.ts`, the `./employee` export in `packages/db/package.json`, `SESSION_SECRET` in `.env.example`.
- Join code (from `/join/[codi]`) leads to username and password; random opaque `compte.id`; scrypt with a per-account salt; a one-time recovery code shown once and stored hashed; a signed HttpOnly session cookie; logout deletes the push subscription.
- Done: create an account from a seeded join code, log out, log in, recover with the code (the code then stops working). Lint and build pass.

### 3. PWA answer flow: `jan/pwa-answer` (heavy, ready)
Spec build steps 3-4.
- Files: `apps/web/app/page.tsx` (employee home), `apps/web/app/(employee)/components/**`, `apps/web/app/api/pool/next/route.ts`, `apps/web/app/api/responses/route.ts`, `packages/db/src/employee-repository.ts`.
- `GET /api/pool/next`: a stub until the engine lands (approved questions for the account's collective, `prioritat` first, nothing answered today, at most 2). The account comes from the session only.
- `POST /api/responses`: zod validation against `PostResponsesRequest`, a regex PII redaction hook (emails, phones, DNI, names after "em dic"), `periode` from the server date.
- Renderers for `escala5`, `escala10`, `swipe`, `ranking`, `obert`, mobile-first.
- Done: answer two questions on a 390 px viewport; rows land in `resposta` with redacted comments. Lint and build pass.

### 4. Installable PWA and push: `jan/pwa-push` (heavy, blocked on 3)
Spec build steps 5-6.
- Files: `apps/web/app/manifest.ts`, `apps/web/public/sw.js`, icons, `apps/web/app/api/push/**`, `scripts/send-daily-push.mjs`, `VAPID_*` in `.env.example`.
- Done: installable on Android Chrome over HTTPS; the subscribe endpoint stores the row; the script sends a notification that opens the app.

### 5. Employee UI refinement: `jan/ui-employee` (light, blocked on 3)
Same visual language as the HR side, tuned for one-hand mobile use. Files: employee routes and components only.

### 6. Security demo: `jan/security-demo` (light, ready)
- Files: `docs/security-demo.md`, `scripts/` additions if needed.
- A 2-minute walkthrough: the lint rule failing on a forbidden import, `pnpm check:anonymity`, suppression of the n<10 group on the results page, the analytics view without `compte_id`, hashed credentials in `compte`.

### 7. Demo script and slide notes: `jan/demo-script` (light, ready)
- Files: `docs/demo-script.md`, `docs/slide-notes.md`.
- The challenge flow end to end (need, AI drafts, approval, publish with QR, phone answer, results, recommendation, follow-up) with who clicks what, the URLs and the fallback for each step. Slide notes follow the deck-headings rule: plain labels, views in the notes.

### 8. HR CSV export with suppression: `jan/hr-export` (light, ready)
- Files: `apps/web/app/hr/results/export/route.ts`, `packages/db/src/hr-repository.ts`.
- Exports only aggregate rows; suppressed segments come out with an empty value and the `suprimit` flag, never a number.

### 9. Phone demo over HTTPS: `jan/tunnel` (light, blocked on 4)
- Files: `docs/phone-demo.md`, `package.json` script.
- Tunnel the dev server (ngrok or cloudflared; test both on the venue network, since some Spanish ISPs block Cloudflare IPs) and set `PUBLIC_BASE_URL` so the QR codes point at it.

### 10. Open the `jan/dev` → `main` PR (coordinating session, after 0)
Lint and build pass on a clean checkout; Natan approves; merge commit.

### 11. Cleanup (coordinating session, after each merge)
Remove the merged worktrees under `.claude/worktrees/` and delete the merged `jan/*` and `claude/*` branches.

### 12. HR home overview: `jan/hr-home` (light, ready)
- Files: `apps/web/app/hr/page.tsx` (it only redirects today), new read functions in `packages/db/src/hr-repository.ts`.
- One screen for the first 10 seconds of the demo:
  - KPI tiles: overall participation against the 1,200 population, respondents this period, open needs, pending drafts, new signals;
  - the domain radar thumbnail;
  - the top 3 signals;
  - "what needs your decision" (drafts to approve, recommendations to decide).
- Aggregates only, with suppression applied.

### 13. Publish page, QR and poster: `jan/publish-qr` (light, ready)
- Files: `apps/web/app/hr/publish/**`, the nav entry.
- Join link per collective from `joincode`, plus a QR rendered server-side as SVG (the `qrcode` package).
- A printable A4 poster in Damm branding ("Escaneja i respon en 1 minut", anonymity promise).
- The QR follows `PUBLIC_BASE_URL`, so it works with the tunnel (9).

### 14. Pitch deck: `jan/deck` (light, ready)
- Built from `docs/slide-notes.md`, with screenshots of the HR portal.
- Plain-label headings, views in the speaker notes.
- Covers the future-evolution slide (services split, APK).

### 15. Demo reset and presenter mode: `jan/demo-reset` (heavy, blocked on 3)
- `pnpm demo:reset`: reseeds, and pre-creates one demo account per collective plus one fresh need, so every run of the demo starts identical.
- An optional `?demo=1` banner on HR pages showing the step number from `docs/demo-script.md`.

### 16. Signal drilldown and follow-up loop: `jan/signals` (light, ready)
- Files: `apps/web/app/hr/recommendations/**`, `apps/web/app/hr/signals/[id]/**`, read functions in `hr-repository.ts`.
- One page per signal:
  - trend by period;
  - representative redacted comment snippets per theme (only themes with n≥10);
  - linked recommendations;
  - the follow-up survey state.
- A small timeline closes the loop: signal, recommendation, follow-up need, new results.

## Trust and rigour (audit, 7 Nov)

Findings from reading `hr-repository.ts` against the seeded fixtures:
- **Suppression can be undone by subtraction.** Logística October: total n=100, shifts 50 + 44 + 6 (suppressed). 100 − 50 − 44 gives the hidden group's n, and once shift-level means exist the hidden mean follows the same way. Primary suppression alone is not enough.
- **Means have no precision.** n=12 and n=160 look equally certain; trend arrows react to any difference.
- **Nothing explains the numbers.** No page says what n, suppression, representativeness gap or a signal mean.
- **Decisions leave no trace.** Approvals overwrite `estat`; nobody can see who approved what, when, or what the AI had proposed.

New read functions for 16 to 20 go in new files under `packages/db/src/` (for example `hr-signals.ts`, `hr-rigour.ts`) and are re-exported from `hr.ts`, so parallel branches do not collide in `hr-repository.ts`.

### 17. Statistical rigour: `jan/rigour` (light)
- Files: `packages/db/src/hr-rigour.ts` (new), `packages/db/src/hr.ts` (re-export), `packages/db/src/hr-repository.ts` (call sites only), `apps/web/app/hr/results/**`, `apps/web/app/hr/trends/**` if it exists.
- Complementary suppression on read: when a parent has exactly one suppressed child (or the suppressed children sum to under 10), also suppress the smallest visible sibling, and blank the n of suppressed cells. Applies to the page and the CSV export.
- Precision: every mean shows its n; a precision label per n band (n < 30 "indicativa", 30 to 99 "moderada", 100 or more "sòlida"). A true confidence interval needs a per-segment standard deviation in `agregat` (see Natan table).
- Change rule: a period-over-period change is only called "puja" or "baixa" when |Δ| ≥ 0.3 on the 1-5 scale and both periods have n ≥ 30; otherwise "sense canvi clar". One constant in `@damm/shared` once agreed, local constant until then.

### 18. Methodology page: `jan/methodology` (light)
- Files: `apps/web/app/hr/metodologia/**`, a nav entry, small "Com es calcula?" links from results, trends and signals.
- In Catalan, one screen: who is counted, minimum group of 10 and complementary suppression, how representativeness and its gap are computed, the precision bands and change rule from 17, what makes a signal, what the AI does and does not do, what is never stored (identities, raw comments).

### 19. Question-quality checker: `jan/draft-check` (light)
- Files: `apps/web/app/hr/drafts/**`, a pure helper in `apps/web/lib/question-check.ts`.
- Deterministic warnings on each draft before approval: double-barrelled ("i", "o" joining two asks), leading wording ("no creus que..."), absolute terms ("sempre", "mai"), over 20 words, jargon list, scale and format mismatch, and a re-identification risk check (mentions of a role, place or shift that would narrow the group below 10). Warnings only; the human decides.

### 20. "Has dit, hem fet": `jan/closing-loop` (light)
- Files: employee home section, a new read function in `packages/db/src/employee-*.ts` that returns approved recommendations and their aggregate context (no per-account data).
- Shows employees what changed because they answered: approved actions per collective, with the period and n. Closing the loop is what keeps participation up and makes the anonymity promise credible.

### 21. Decision audit log and AI provenance: `jan/audit-log` (blocked on schema)
- Needs a `decisio` table (what, previous and new state, AI original text, timestamp, HR role) and a `font` field on `pregunta` and `recomanacio` (source signal, n, confidence). Shared contract: agree with Natan first.

## Needs Natan first

| Item | Why it matters | Unblocks |
|------|----------------|----------|
| Engine function signature in `packages/engine` | swap the pool stub for the real selection | 3 (final), demo |
| Draft-questions call in `packages/ai` | the need form creates real AI drafts | HR need flow |
| Analysis job writing `agregat`, `tema`, `senyal` from seeded responses | results show seed data instead of the init fixtures | results, demo |
| New `./employee` export in `packages/db` and `SESSION_SECRET` in `.env.example` (already in `jan/dev`: tell Natan before the PR) | shared contract | 2 (done), 4 |
| Branch protection on `main` | repo flow | 10 |
| A standard deviation (`desviacio`) per `agregat` row, written by the analysis job | real confidence intervals instead of n bands | 17 (full) |
| Complementary suppression in the analysis job too, so stored aggregates are already safe | defence in depth for 17 | 17 |
| `decisio` table and `font` provenance fields | audit trail of human decisions over AI proposals | 21 |
| Signals carry a minimum effect size and n in their criteria | signals are not noise | 16, 18 |
