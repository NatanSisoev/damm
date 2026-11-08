#!/usr/bin/env bash
# Railway start step: build the demo DB on the volume if it is missing, then start Next on $PORT.
# Idempotent: an existing DB is never touched. To reseed, delete the file and redeploy (see docs/deploy.md).
set -euo pipefail

DB_PATH="${DB_PATH:-/data/app.db}"
export DB_PATH

if [ ! -s "$DB_PATH" ]; then
  echo "[start] no database at $DB_PATH, building the trilingual demo database (about 90 s)"
  mkdir -p "$(dirname "$DB_PATH")"
  TMP="$DB_PATH.building"
  rm -f "$TMP" "$TMP-wal" "$TMP-shm"
  pnpm demo-db -- --out "$TMP"
  mv "$TMP" "$DB_PATH"
  rm -f "$TMP-wal" "$TMP-shm"
  echo "[start] database ready"
else
  echo "[start] using existing database at $DB_PATH"
fi

node scripts/fix-join-codes.mjs
# TEST_ACCOUNT (optional, "user:password") is created by apps/web/instrumentation.ts when Next starts below.

cd apps/web
exec pnpm exec next start -H 0.0.0.0 -p "${PORT:-3000}"
