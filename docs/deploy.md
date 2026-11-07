# Deploy (Railway)

Status: project and service are created and configured, but the **first GitHub deploy is blocked** until the Railway GitHub app has access to `NatanSisoev/damm` (see "GitHub access"). Nothing below has been verified on a live deploy yet.

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

Every push to the deploy branch redeploys. For now the branch is `jan/deploy`. At checkpoint CP3 switch it to `main`: Railway dashboard > `web` > Settings > Source > Branch, set `main`, then `railway redeploy --from-source -y`. If a push did not trigger a deploy, run `railway redeploy --from-source -y` (a plain `railway redeploy` reuses the old commit).

## Build and start

- Build: `pnpm install --frozen-lockfile && pnpm build` (Node 22 from `.nvmrc`, pnpm 10 from `packageManager`).
- Start: `bash scripts/railway-start.sh`. If `$DB_PATH` is missing or empty it builds the engine demo database (`pnpm --filter @damm/engine run demo --out ...`, about 1.5 to 4 min) into a temp file on the volume and renames it, then starts Next on `$PORT`. An existing database is never touched. The health check allows 600 s so the first boot can finish seeding.

## Environment variables (names only)

`DB_PATH` (`/data/app.db`), `PUBLIC_BASE_URL` (the URL above, no trailing slash), `HR_ACCESS_CODE`, `SESSION_SECRET`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NODE_ENV`. `TEAMS_WEBHOOK_URL` is not set (empty locally). The VAPID pair was generated for this deploy only. Values live in Railway; set with `railway variables --set NAME=value`. A deleted variable needs `railway redeploy -y` to take effect.

## Reseed

Delete the database and redeploy, the start step rebuilds it:

```bash
railway ssh -- rm -f /data/app.db /data/app.db-wal /data/app.db-shm
railway redeploy -y
```

## Health check

```bash
railway ssh -- sh -c 'cd /app && DB_PATH=/data/app.db pnpm --filter @damm/engine run health'
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
- HR login uses `HR_ACCESS_CODE`, the same value as in Jan's local `.env`.
