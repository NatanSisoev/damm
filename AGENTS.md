# Agent guidelines

Two people work on this repo: **Jan** and **Natan**. Goal: move fast, keep `main` always demo-ready, keep merges and PRs under control. Applies to any AI agent working here.

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

## Hard rules

- Never push or commit to `main`.
- Never touch the other person's branches.
- Stay in your area (see Ownership). If a change is needed outside it, tell the user so they can coordinate with the other person.
- Keep PRs small and focused: one task per PR.
- Run the project's checks (tests, lint, typecheck, build) before opening a PR, once they exist.
- Commit messages: short, imperative, no trailers.

## Ownership

Work is split by area so the two of you rarely edit the same files. Stay in the areas your person has claimed. The shared contract (DB schema and API types) is agreed by both before anyone builds on it; change it only after telling the other person.

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
- **Typeform is ignored.** The app is the only channel. "Publish" means putting approved questions in the survey pool and generating the join link and QR.
- **App:** standalone mobile app (PWA). Onboarding: join code (identifies company and collective), then the user picks a username and password. The account maps to an opaque internal ID. No email or phone, no personal data. Credentials are salted-hashed. Recovery uses a one-time code.
- **Admin sees only counts per collective, never identities.**
- **Longitudinal tracking** per internal ID is for trajectory clustering only. It is never shown per person and never leaves the analysis layer.
- **Hybrid engine:** continuous monitoring is the base (dynamic question pool over the 6 domains, about 2 questions a day, no same question 4 days in a row, more sampling on outliers). An approved HR need enters the pool with top priority.
- **Synthetic data:** about 1,200 synthetic employees as the representativeness denominator, about 700 responses over 3 periods (Aug, Sep, Oct 2026), about 500 open comments. Deliberate biases: low night-shift response, an October emerging theme (shift system communication and breaks), a weak signal in Logística (safety equipment, heat), manager positivity bias, one sub-threshold group. Comments are generated once with the LLM and committed as JSON, so nobody needs the key to seed.

## LLM

- OpenAI-compatible API served by UAB DCC: `https://dcc-llm-gw.uab.cat/uabthehack/v1`, models `ornith` and `nemotron`.
- The team key goes in `.env` only (`LLM_API_KEY`), never in code, commits, slides or chat. `.env.example` has the variable names with empty values.

## Stack and commands

- TypeScript monorepo, Next.js frontend (PWA), LLM via the endpoint above for question generation and comment clustering, SQLite with a seed script generating synthetic employees (Fàbriques, Logística, Comercial, Oficines).

Install, run, test and build commands: add them here as soon as they exist.

## Before the demo

In the last hour, branch protection can relax to "merge your own PR if checks pass". Freeze new features, only fix and polish, and make sure `main` builds and runs from a clean clone.
