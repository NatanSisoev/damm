# Give a Damm

Estrella Damm, UAB THE HACK 2026. An active-listening platform that turns an HR need in natural language into AI-drafted micro-surveys, collects anonymous answers from a mobile app (PWA), and turns them into aggregated insights, recommendations and follow-up surveys.
AI proposes, a human decides: every question is approved by HR before it is published.
Anonymity is guaranteed by design: only aggregates are shown, never individual answers.

## Quick start

Requires Node and pnpm 10.

```bash
pnpm install
cp .env.example .env   # fill in values; never commit .env
pnpm demo-db   # builds the demo database data/app.db (about 90 s; trilingual, 99 days of synthetic answers)
pnpm dev
```

The app runs at http://localhost:3000. `PUBLIC_BASE_URL` (default `http://localhost:3000`) is the base for join links.

Other commands: `pnpm lint`, `pnpm build`. There is no test suite yet.

## Repo layout

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

Some packages are not created yet.

## Non-negotiable rules

- Synthetic data only. No real Damm or personal data.
- No secrets (tokens, keys) in code, repos or slides. Use `.env`, never commit it.
- Always aggregated, with a minimum group size. Never show individual answers.
- AI proposes, a human decides.

## More

See [AGENTS.md](AGENTS.md) for branches, workflow, product decisions and architecture.
