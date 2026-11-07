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
| 6 | Security demo | `jan/security-demo` | running | light |
| 7 | Demo script and slide notes | `jan/demo-script` | done | light |
| 8 | HR CSV export with suppression | `jan/hr-export` | done | light |
| 10 | `jan/dev` → `main` PR | coordinating session | ready | light |
| 12 | HR home overview | `jan/hr-home` | running | light |
| 13 | Publish page: join link, QR and print poster | `jan/publish-qr` | running | light |
| 14 | Pitch deck | `jan/deck` | ready | light |
| 15 | Demo reset and presenter mode | `jan/demo-reset` | ready | heavy |
| 16 | Signal drilldown and follow-up loop view | `jan/signals` | ready | light |

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

## Needs Natan first

| Item | Why it matters | Unblocks |
|------|----------------|----------|
| Engine function signature in `packages/engine` | swap the pool stub for the real selection | 3 (final), demo |
| Draft-questions call in `packages/ai` | the need form creates real AI drafts | HR need flow |
| Analysis job writing `agregat`, `tema`, `senyal` from seeded responses | results show seed data instead of the init fixtures | results, demo |
| New `./employee` export in `packages/db` and `SESSION_SECRET` in `.env.example` (already in `jan/dev`: tell Natan before the PR) | shared contract | 2 (done), 4 |
| Branch protection on `main` | repo flow | 10 |
