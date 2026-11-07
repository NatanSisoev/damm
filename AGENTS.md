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

## Stack and commands

- TypeScript monorepo, Next.js frontend, LLM API for question generation and comment clustering, SQLite with a seed script generating synthetic employees (plant, logistics, sales, offices).

Install, run, test and build commands: add them here as soon as they exist.

## Before the demo

In the last hour, branch protection can relax to "merge your own PR if checks pass". Freeze new features, only fix and polish, and make sure `main` builds and runs from a clean clone.
