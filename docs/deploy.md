# Deploy (Railway)

Status: live. The `web` service deploys from GitHub (`NatanSisoev/damm`, branch `main`).

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

Railway's `web` service builds from `main` on GitHub, and every merge to `main` redeploys. To release, merge the PR into `main` (merge commit); nothing else is needed.

If a merge did not trigger a deploy, run `railway redeploy --from-source -y` (a plain `railway redeploy` reuses the old commit). If the release changes the schema or the demo data, reseed (see below).

## Build and start

The service builds from the root [`Dockerfile`](../Dockerfile) (`"builder": "DOCKERFILE"` in `railway.json`), not Railpack. Railpack downloads mise from GitHub at build time, and that download failed with a 504 on 2026-11-08. The Dockerfile pulls the `node:22-bookworm` image and npm packages instead. It runs the same commands as below (`pnpm install --frozen-lockfile`, `pnpm build`, then `bash scripts/railway-start.sh` as the start command), with Node 22 and pnpm 10.16.1 pinned in the file. `.dockerignore` keeps `data/`, `.env*` and `node_modules` out of the image; `docs/i18n` must stay in, because `pnpm demo-db` reads it.

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

## Demo reset (N-17)

`DEMO_RESET_ENABLED=1` shows a "Restaura la demo" card (confirm dialog) on `/hr/settings`; without it the card is hidden and the action refuses. A reset copies every table except `compte`, `push_subscripcio` and `hr_push_subscription` back from the snapshot `<DB_PATH>.pristine` inside one transaction on the live connection (needs, approvals, publications, alarm statuses, answers and engine state go back; enrolled phones stay).

The snapshot is written by `scripts/railway-start.sh` right after the demo DB is built. For a DB that already exists (no snapshot), the server writes one at its first start with the flag on, so set the flag only while the DB is clean (right after a reseed), or reseed first. `pnpm demo-db` deletes the old snapshot of the DB it rebuilds.

```bash
railway variables --set DEMO_RESET_ENABLED=1
```

## Live phone trigger (N-19)

`DEMO_LIVE_JOB=1` runs the engine job in the background after each stored answer (debounce `DEMO_LIVE_JOB_DEBOUNCE_MS`, default 1500) and pushes HR for new warning or critical alarms. Set it with `DEMO_RESET_ENABLED=1` only for the demo; steps and the math are in `docs/demo-script.md`. It needs the demo DB built by this branch (the primed Comercial segment and its published need). Watch it with `railway logs`: lines start with `[demo-live-job]`.

```bash
railway variables --set DEMO_LIVE_JOB=1
```

## Quick join for the jury

`DEMO_QUICK_JOIN=1` adds an "Enter the demo" button under the onboarding form (after scanning a collective QR). It creates a throwaway account (random `demo-xxxxxxxx` username, random password nobody sees, no recovery code) in that collective, signs in and opens the app. The flag is checked again on the server, so the action does nothing without it. Unset it after the demo.

```bash
railway variables --set DEMO_QUICK_JOIN=1
```

With the flag on, any answer opens an alarm: the engine's own when it finds one, otherwise the staged "Demo:" one on Logística · Condicions i organització. Read `railway logs` after one answer; the first line that is missing is where it broke:

| Log line | If missing or odd |
|---|---|
| `[demo-live-job] answer stored but DEMO_LIVE_JOB is ...` | the flag is not `1` on the service |
| `[demo-live-job] answer stored, run scheduled` | the answer never reached the route (see the `POST /api/responses` line) |
| `[demo-live-job] engine found no new alarm, staged fallback: ...` | it names why no alarm opened (no segment with n >= 10, cooldown) |
| `[hr-push] off: VAPID...` | VAPID keys missing or invalid on the service |
| `[hr-push] ... no HR browser is subscribed` | turn on alarm push on `/hr/settings` (a reseed or demo reset wipes it) |
| `[hr-push] N alarm(s), M subscribed browser(s), K delivered` | K < M: see the `[hr-push] send failed: <status>` line (404/410 drop the dead subscription) |
| `[demo-live-job] done ... push: ...` | final summary of the run |

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
