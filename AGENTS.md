# Agent guidelines

Two people work on this repo: **Jan** and **Natan**. Goal: move fast, keep `main` always demo-ready, keep merges and PRs under control. Applies to any AI agent working here.

## Docs (read before working on the area)

| Doc | What | Read when |
|---|---|---|
| [`docs/contract-changes.md`](docs/contract-changes.md) | checklist log of every shared-contract change | **after every sync or pull** (see Sync rules) |
| [`docs/engine.md`](docs/engine.md) | engine model: scheduling, scores / confidence / consensus, follow-ups, insights, alarms, learning | working on or with the engine |
| [`docs/engine-integration.md`](docs/engine-integration.md) | how the employee app, HR dashboard and jobs call `@damm/engine` | wiring routes or pages to the engine |
| [`docs/question-types.md`](docs/question-types.md) | every question type with an example DB row and answers | writing questions, the seed or the answer UI |
| [`docs/deploy.md`](docs/deploy.md) | Railway deploy: project, env var names, volume, reseed, health check, switching branch to `main` | deploying or debugging the live URL |

Engine commands (from `packages/engine`, after `pnpm install`; Node 22.5+, no native modules needed):
- Test: `pnpm test` (Node test runner, in-memory SQLite)
- Typecheck: `pnpm typecheck`
- Run the job on the dev DB: `pnpm --filter @damm/engine run job` (`DB_PATH`, default `data/app.db`)
- Build the demo DB (3 months of synthetic answers with planted alarms and insights, about 4 min): `pnpm --filter @damm/engine run demo`, then run the app with `DB_PATH=data/demo.db`
- Health check on a real DB (ranges, suppression, no NaN, fresh job, deduplicated alarms; exits non-zero on failure; run it before and during the demo): `pnpm --filter @damm/engine run health` (`DB_PATH`, default `data/app.db`)
- Simulate and tune the engine against known ground truth: `pnpm --filter @damm/engine run sim` / `run tune`

## Branches

- `main`: protected, always runnable. Nobody commits to it directly.
- `jan/dev`, `natan/dev`: long-lived personal integration branches. Use `/dev`, never a bare `jan` or `natan`: git cannot hold both `jan` and `jan/auth`.
- `jan/<task>`, `natan/<task>`: short-lived sub-branches, one task each, created from the owner's `/dev` branch (example: `jan/auth`). Delete after merging.

Find out who you are working for (Jan or Natan) from `git config user.name` or by asking. Work only on that person's branches.

## Flow

1. Branch from your `<name>/dev`: `git switch <name>/dev && git switch -c <name>/<task>`.
2. Merge the sub-branch into `<name>/dev` when done. No review needed.
3. Open a PR from `<name>/dev` into `main`. The other person approves. Merge with a **merge commit**, not squash (squash on long-lived branches causes phantom conflicts on the next sync).
4. Merge `<name>/dev` into `main` often (at least every few hours and before each demo checkpoint) so PRs stay small and the other person sees your work.

## Sync rules

- Sync at the start of every session and before opening any PR: `git fetch`, then if `origin/main` has new commits, merge `origin/main` into `<name>/dev`, then merge `<name>/dev` into the sub-branch you are on.
- Sync only through `main`. Never merge `jan/dev` and `natan/dev` into each other.
- **Merge, never rebase** a branch that has been pushed. **Never force-push.**
- On any merge conflict: stop, show the conflict, and ask. Do not guess at resolutions.
- When the user says "sync", do the above.
- **After every sync or pull, process the contract change log** (`docs/contract-changes.md`) before any other work:
  1. Find every entry with an open action item (`- [ ]`) for your person.
  2. Apply it in your own area, then tick it (`- [x]`) and add `(done YYYY-MM-DD, <commit>)`. If you cannot apply it yet, leave it open and tell the user why.
  3. Commit the ticks with the work, so the other person sees what was incorporated.
  4. Never edit or tick the other person's items. Never delete entries: the log is the history.

## Hard rules

- **No traces of AI tooling in git, locally or on the remote.**
  - Branch names are only `<name>/dev` or `<name>/<task>`: never `claude/*` or other tool-generated names. If a tool creates a branch with such a name, rename it before the first push (`git branch -m`).
  - No `Co-Authored-By`, "Generated with" or similar lines in commit messages, PR titles or PR descriptions.
  - Never commit tool folders or files (`.claude/`, worktree folders, agent scratch files).

- Never push or commit to `main`.
- Never touch the other person's branches.
- Stay in your area (see Ownership). If a change is needed outside it, tell the user so they can coordinate with the other person.
- Keep PRs small and focused: one task per PR.
- Run the project's checks (tests, lint, typecheck, build) before opening a PR, once they exist.
- Commit messages: short, imperative, no trailers.

## Ownership

Work is split by area so the two of you rarely edit the same files. Stay in the areas your person has claimed. The shared contract (DB schema and API types) is agreed by both before anyone builds on it; change it only after telling the other person.

- **Natan:** the engine (`packages/engine`): question scheduling, domain scores with confidence and consensus, personal trajectories and follow-ups, insights and alarms. Design: `docs/engine.md`.
- **Contract change log:** every change to `packages/db/schema.sql`, `packages/shared` or an API another person calls gets an entry in `docs/contract-changes.md`, in the same commit. Each entry lists action items as checkboxes per person. See the sync rules for how to process it.
- **Naming:** new code, tables, columns, enum values and docs are in English. Existing Catalan table and column names stay until both agree to rename them.

## Challenge

Estrella Damm, UAB THE HACK 2026: an active-listening platform that creates tailored micro-surveys, gets representative participation, and turns answers into insights and actions, while always guaranteeing anonymity.

Flow to cover: need in natural language, AI-drafted questions, human approval, publish (link/QR), mobile response, analysis (themes, trends, weak signals), dashboard with representativeness, recommendations and follow-up survey.

Non-negotiable rules:
- Synthetic data only. No real Damm or personal data.
- No secrets (tokens, keys) in code, repos or slides. Use `.env`, never commit it.
- Always aggregated, with a minimum group size. Never show individual answers.
- AI proposes, a human decides.

## Product decisions

- **Collectives (4):** Fàbriques, Logística, Comercial, Oficines. Manager is a role flag, not a collective.
- **Domains (6):** Benestar, Lideratge, Desenvolupament, Cultura i pertinença, Entorn i relacions, Condicions i organització. Each collective gets a different subset of items per domain.
- **Minimum group size: 10.** Any segment (collective, shift, period, domain) with fewer than 10 respondents is suppressed everywhere, dashboard and exports included.
- **No time tracking, no clock-in anchor.**
- **Typeform is ignored.** The app is the only channel. "Publish" means putting an approved need's questions in the survey pool and sending a web push notification to the subscribed devices of its collective (all collectives when it has none). Join links and QR codes are per-collective onboarding codes on `/hr/publish`, not per need.
- **App:** standalone mobile app (PWA). Onboarding: join code (identifies company and collective), then the user picks a username and password. The account maps to an opaque internal ID. No email or phone, no personal data. Credentials are salted-hashed. Recovery uses a one-time code.
- **Admin sees only counts per collective, never identities.**
- **Longitudinal tracking** per internal ID is for trajectory clustering only. It is never shown per person and never leaves the analysis layer.
- **Hybrid engine:** continuous monitoring is the base (dynamic question pool over the 6 domains, about 2 questions a day, no same question 4 days in a row, more sampling on outliers). An approved HR need enters the pool with top priority.
- **Synthetic data:** about 1,200 synthetic employees as the representativeness denominator, about 700 responses over 3 periods (Aug, Sep, Oct 2026), about 500 open comments. Deliberate biases: low night-shift response, an October emerging theme (shift system communication and breaks), a weak signal in Logística (safety equipment, heat), manager positivity bias, one sub-threshold group. Comments are generated once with the LLM and committed as JSON, so nobody needs the key to seed.

## Architecture

One TypeScript monorepo, one backend process with clean internal modules. No separate services: everything shares one SQLite file, and the central-server idea (send questions out, receive anonymized answers back) is a module and data boundary, not a deployment one. Splitting into services later is cheap because of these boundaries (future-evolution slide).

```
apps/web/            Next.js app
  app/               employee PWA (onboarding, answering, push)
  hr/                HR dashboard (need, drafts, approval, publish, results, recommendations)
  api/               HTTP routes for both sides
packages/db/         schema, migrations, repositories (shared contract)
packages/shared/     types, zod schemas, constants (shared contract)
packages/engine/     question selection (pure, deterministic, unit-testable)
packages/ai/         draft questions, PII redaction, recommendations (LLM calls)
packages/analysis/   clustering, trends, weak signals, representativeness, aggregates
packages/seed/       synthetic population, responses and comments
```

### Layers

1. **Data:** SQLite. Tables: reference (`collectiu`, `domini`, `centre_tipus`, `torn`), synthetic population (`empleat_sintetic`, seed only), accounts (`joincode`, `compte`), content (`necessitat`, `pregunta`, `publicacio`), responses (`resposta`, one row per answered question; comments stored redacted only), analysis outputs (`tema`, `comentari_tema`, `agregat`, `senyal`, `recomanacio`) and the hidden seed label (`resposta_seed`, never shipped with the app).
2. **Engine:** given an account context and the pool state, returns the next questions: about 2 a day, no same question 4 days in a row, approved HR needs first, more sampling on outliers, formats and timing per collective and shift.
3. **AI:** drafts questions from a need, redacts PII from comments, proposes recommendations and follow-up surveys. Proposals only, a human approves.
4. **Analysis:** runs as jobs (script or `POST /api/jobs/run`) and writes aggregate tables. Clusters comments, finds emerging themes and weak signals, compares periods, computes representativeness against the synthetic population and suppresses segments below the minimum group size.
5. **Employee app (PWA):** join code onboarding, answer UI per collective, push notifications, response submission.
6. **HR dashboard:** need in natural language, review and approve AI drafts, publish (push to the collective; join links and QR per collective for onboarding), results with representativeness, recommendations, follow-up survey.

### Integration points

- The employee side and the HR side meet only through the DB and two endpoints: `GET /api/pool/next` (questions for an account) and `POST /api/responses` (answers in).
- Approved questions enter the pool via `pregunta.estat = aprovada`. Publishing marks the need `publicada` and notifies the collective by web push; HR gets back only an aggregate device count (`<10` under the minimum group size).
- Analysis jobs write `agregat`, `tema`, `comentari_tema`, `senyal`, `recomanacio`. The dashboard reads only these. The LLM is never called in a dashboard request path.
- The seed makes both sides workable independently: seeded responses feed analysis, seeded approved questions feed the engine.

### Anonymity boundary (enforced in code, shown in the security demo)

- Employee-side code may touch `compte`, `resposta` and the push-subscription table.
- HR-side code and analysis read only the aggregate outputs and an analytics view without `compte_id`. HR routes import only the HR repository, never the raw response repository.
- The trajectory job is the one reader of per-account history. It writes aggregates only.
- The push subscription is stored in its own table keyed by `compte_id`, deleted on logout, never joined to analytics.
- Admin sees account counts per collective only.

### Push notifications

Web push through the PWA (service worker plus VAPID keys in `.env`, `web-push` on the server). No APK. Android Chrome works installed or not; iOS needs the PWA added to the home screen (16.4+) and a user tap for permission. Push needs public HTTPS, so use a tunnel or a quick deploy for the phone demo. APK (Capacitor plus FCM) is a future-evolution item.

### Shared contract

`packages/db` and `packages/shared` (schema, types, API shapes) are the shared contract. Agree changes before building on them.

## LLM

- OpenAI-compatible API served by UAB DCC: `https://dcc-llm-gw.uab.cat/uabthehack/v1`. Only model: `ornith` (`nemotron` returns 404; checked 2026-11-07). It is a reasoning model: it thinks in a separate `reasoning` field before answering in `content`, so use a large `max_tokens` (1500+) and handle `content: null`. Send request bodies as UTF-8.
- The team key goes in `.env` only (`LLM_API_KEY`), never in code, commits, slides or chat. `.env.example` has the variable names with empty values.

## Stack and commands

- TypeScript monorepo, Next.js frontend (PWA), LLM via the endpoint above for question generation and comment clustering, SQLite with a seed script generating synthetic employees (Fàbriques, Logística, Comercial, Oficines).

Commands (run from the repo root, pnpm 10):

- Install: `pnpm install`
- Create the dev DB: `pnpm --filter @damm/db run init` (writes `data/app.db`; override the path with `DB_PATH`)
- Run: `pnpm dev`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Seed the dev DB (fresh, deterministic, ~1,200 synthetic employees, ~700 responses, ~500 comments): `pnpm --filter @damm/seed run seed`. Regenerate comments (template mode, or `-- --llm` with `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`): `pnpm --filter @damm/seed run comments`.
- Test: no test suite yet.
- Anonymity checks: `pnpm check:anonymity` fails if HR code or `@damm/db/hr` touches raw responses/accounts or the analytics view exposes `compte_id`; `pnpm lint` enforces the HR import rules (only `@damm/db/hr` and `@damm/shared`).

Config: copy `.env.example` to `.env` and fill it in. `PUBLIC_BASE_URL` (default `http://localhost:3000`) is the base for join links.

## Docs

Read these before planning work. Both people's agents keep them current.

- `docs/requirements.md`: **the source of truth for scope.** It lists every requirement from the challenge deck and the participant guide with an ID (R-FLOW-2a, R-PRIV-8, N-5 and so on). Each one has a status, where it lives in the code, and its gap. The file ends with nice-to-haves and a list of the gaps that need the engine, AI, analysis or a schema change.
  - Before starting a task, find the IDs it covers.
  - Cite the IDs in commits, PRs and session briefs.
  - When work merges into your `/dev` branch, update the status of those IDs in the same merge.
  - Before a PR or a demo checkpoint, check that every Must still holds, starting with section 0 (the exclusion criteria).
- `docs/backlog.md`: numbered tasks with their state (done, ready, blocked, deferred). It also has a "Needs Natan first" table. Mark a task done when it merges.
- `docs/employee-pwa-spec.md`: the employee app's screens, flow and anonymity copy.
- `docs/security-demo.md`: the steps for the anonymity and security demo (exclusion criteria, R-PRIV).
- `docs/demo-script.md` and `docs/slide-notes.md`: the pitch flow and the slide content.
- `docs/teams-integration.md`: what the Teams publish card does today and the Graph/bot/Entra roadmap (R-FLOW-4d, N-1).
- `docs/frontend-audit.md`: employee, HR and manager frontend audit (2026-11-07) with P0/P1/P2 findings and owners.
- `docs/hr-ui-audit.md`: HR portal and manager view audit (2026-11-07), one table per screen with severity, fix and status.
- `docs/visual-identity.md`: the chosen visual identity ("Paper": ink on paper, Hanken only, 2px corners, red as signal) for employee, HR and manager, with the code changes needed to apply it.
- `docs/e2e-test-plan.md`: manual end-to-end runbook for the full loop (setup, main scenario, edge-case scenarios, results log); run it after merging `jan/dev` with `main`.
- `docs/user-flows.md`: expected user flow paths per persona (employee, HR, manager, anonymity, jobs) with exact UI copy, branches, invariants and expected gaps; ends with a requirement-to-flow matrix and a flow-to-e2e-case map. Source for reworking the e2e plan.
- `docs/ai-drafting-eval.md`: how need drafting is evaluated (cases, checks, judge), per-round results, remaining weaknesses and the `options_json` gap (R-FLOW-2a..2g).
- `docs/copy-guide.md`: Catalan voice rules, glossary and before/after examples for every user-facing string.

When you add a doc, list it here with one line on what it is for.

## Before the demo

In the last hour, branch protection can relax to "merge your own PR if checks pass". Freeze new features, only fix and polish, and make sure `main` builds and runs from a clean clone.
