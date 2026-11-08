# Deploy (Railway)

Status: live. The `web` service deploys from GitHub (`NatanSisoev/damm`, branch `jan/deploy`).

## Where things are

| What | Value |
|---|---|
| Railway account | jmunts@axisdatalabs.com (workspace "jmunts-adl's Projects") |
| Project | `damm` (id `f592276a-da20-4a0d-ae3d-83ef3f59a91d`), environment `production` |
| Service | `web` (id `cff60e63-b442-4e45-baea-b46b9904e2b4`), source GitHub `NatanSisoev/damm` |
| Public URL | https://web-production-6e775.up.railway.app |
| Volume | `web-volume`, mounted at `/data` |
| Config | [`railway.json`](../railway.json) (build and start), [`scripts/railway-start.sh`](../scripts/railway-start.sh) |

Never run `railway` from `/tmp` or `/private/tmp` (linked to an unrelated production project). Run it from a checkout of this repo, and check `railway status` first.

## GitHub access

Railway deploys from GitHub only (never `railway up`). The repo is Natan's personal repo, so its owner must let the Railway GitHub app see it: GitHub > Settings > Applications > Railway > Configure > Repository access > add `damm` (or "all repositories"). Until then `railway redeploy --from-source` fails with `Repository "NatanSisoev/damm" not found or is not accessible`.

## How deploys trigger

Railway's `web` service builds from the dedicated release branch `jan/deploy`, and every push to it redeploys. Nobody develops on it: it only ever holds a version of `main` that is ready to go live.

To release, fast-forward it to `main` after the PR merges, then push (no merge commit, never a force-push):

```bash
git fetch origin && git switch jan/deploy && git merge --ff-only origin/main && git push origin jan/deploy
```

If `--ff-only` fails, `jan/deploy` has commits that are not in `main`: get them into `main` through `jan/dev` first. If a push did not trigger a deploy, run `railway redeploy --from-source -y` (a plain `railway redeploy` reuses the old commit). If the release changes the schema or the demo data, reseed (see below).

## Build and start

- Build: `pnpm install --frozen-lockfile && pnpm build` (Node 22 from `.nvmrc`, pnpm 10 from `packageManager`).
- Start: `bash scripts/railway-start.sh`. If `$DB_PATH` is missing or empty it builds the trilingual demo database (`pnpm demo-db -- --out ...`, the same DB as local `pnpm demo-db`, about 90 s; needs Node 22.6+ for `--experimental-strip-types`, pinned by `.nvmrc` 22 and `engines`) into a temp file on the volume and renames it, then starts Next on `$PORT`. An existing database is never touched. The health check allows 600 s so the first boot can finish seeding.

## Environment variables (names only)

`DB_PATH` (`/data/app.db`), `PUBLIC_BASE_URL` (the URL above, no trailing slash), `HR_ACCESS_CODE`, `SESSION_SECRET`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NODE_ENV`. `TEAMS_WEBHOOK_URL` and `TEAMS_ALARM_WEBHOOK_URL` are not set (empty locally; the alarm one falls back to the first). The VAPID pair was generated for this deploy only. Values live in Railway; set with `railway variables --set NAME=value`. A deleted variable needs `railway redeploy -y` to take effect.

Optional `TEST_ACCOUNT=username:password` (not set on Railway unless Jan asks): on server start (`apps/web/instrumentation.ts`, so also under `scripts/railway-start.sh`) the account is created in Fàbriques if missing, with the app's normal scrypt hashing. Idempotent, never overwrites an existing account, works on the demo DB and any other. Password needs 8+ characters.

## Reseed

Delete the database and redeploy, the start step rebuilds it with `pnpm demo-db` (trilingual ca/es/en):

```bash
railway ssh -- rm -f /data/app.db /data/app.db-wal /data/app.db-shm
railway redeploy -y
```

`railway ssh` can fail when SSH port 22 times out. Alternative (used on 2026-11-08): set the `DB_PATH` variable to a new file name on the volume. Setting a variable redeploys, and the start step builds the demo DB at the new path on first start. Live is now `DB_PATH=/data/app-tri.db`; for the next reseed pick another name (the old file stays on the volume until removed). The build takes about 9 minutes on Railway, and the site returns 502 until it finishes.

```bash
railway variables --set DB_PATH=/data/app-<new-name>.db
```

## Health check

```bash
railway ssh -- sh -c 'cd /app && DB_PATH=/data/app-tri.db pnpm --filter @damm/engine run health'
```

Exit code 1 means a check failed.

## Push caveats

Web push needs public HTTPS (provided by Railway). On iOS the PWA must be installed to the home screen first (iOS 16.4 or later); push does not work from a plain Safari tab.

## Push on a phone

The VAPID pair is set as Railway variables, so `pushEnabled()` is true on the deploy. Subscriptions are stored in the SQLite DB on `/data`, so they survive redeploys (a reseed wipes them).

- Android Chrome: works from the URL, installed or not. Open the app, tap "Activa les notificacions" in the employee settings.
- iPhone: iOS 16.4 or later. Safari, Share, Add to Home Screen, open the app from the icon, then tap "Activa les notificacions".
- Trigger: publishing an approved need in `/hr` notifies that need's collective, or everyone if it has none.
- HR only ever sees a device count, shown as "<10" under the minimum group size.
- HR login uses `HR_ACCESS_CODE`, a Railway variable (set with `railway variables --set`); it is not in the repo, and the local `.env` has its own value.

## Join codes

The start script runs `scripts/fix-join-codes.mjs` on every boot: it renames `DEMO-FÀB` to `DEMO-FAB` in the volume DB when the old code exists and the new one does not. Lookup ignores accents, case and hyphens, so old links keep working.
