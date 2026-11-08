#!/usr/bin/env bash
# Security demo, step 3: shows a group under 10 being suppressed, on a scratch copy of the demo DB.
# Thins one segment (Comercial, 2026-10) to 6 respondents, re-runs the engine job on the copy and
# prints what the HR repository (the only door HR code has) and the CSV export hand out.
# The source DB is never modified.
#
# Run from the repo root after `pnpm demo-db`:  bash scripts/suppression-demo.sh
# Options (env): SRC=data/app.db  COPY=/tmp/damm-suppression-demo.db  PERIOD=2026-10  COLLECTIU=3  KEEP=6
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SRC="${SRC:-data/app.db}"
COPY="${COPY:-/tmp/damm-suppression-demo.db}"
PERIOD="${PERIOD:-2026-10}"
COLLECTIU="${COLLECTIU:-3}" # 3 = Comercial in the demo DB
KEEP="${KEEP:-6}"

[ -f "$SRC" ] || { echo "Missing $SRC. Run: pnpm demo-db" >&2; exit 2; }
[ "$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")" != "$(cd "$(dirname "$COPY")" && pwd)/$(basename "$COPY")" ] || { echo "COPY must differ from SRC" >&2; exit 2; }

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }

bold "1/4  Copy $SRC to $COPY (the original stays untouched)"
rm -f "$COPY" "$COPY-shm" "$COPY-wal"
sqlite3 "$SRC" ".backup '$COPY'"

bold "2/4  Respondents before and after thinning ($PERIOD, collectiu $COLLECTIU)"
sqlite3 "$COPY" "SELECT count(DISTINCT compte_id) AS respondents_before FROM resposta r JOIN compte c ON c.id=r.compte_id WHERE c.collectiu_id=$COLLECTIU AND r.periode='$PERIOD';"
sqlite3 "$COPY" <<SQL
CREATE TEMP TABLE keep AS
  SELECT DISTINCT r.compte_id FROM resposta r JOIN compte c ON c.id=r.compte_id
  WHERE c.collectiu_id=$COLLECTIU AND r.periode='$PERIOD' ORDER BY r.compte_id LIMIT $KEEP;
UPDATE assignment SET answered_at=NULL
  WHERE answered_at IS NOT NULL AND substr(day,1,7)='$PERIOD'
    AND compte_id IN (SELECT id FROM compte WHERE collectiu_id=$COLLECTIU)
    AND compte_id NOT IN (SELECT compte_id FROM keep);
DELETE FROM resposta
  WHERE periode='$PERIOD'
    AND compte_id IN (SELECT id FROM compte WHERE collectiu_id=$COLLECTIU)
    AND compte_id NOT IN (SELECT compte_id FROM keep);
SQL
sqlite3 "$COPY" "SELECT count(DISTINCT compte_id) AS respondents_after FROM resposta r JOIN compte c ON c.id=r.compte_id WHERE c.collectiu_id=$COLLECTIU AND r.periode='$PERIOD';"

bold "3/4  Re-run the analysis job on the copy, then the health check"
DB_PATH="$COPY" pnpm --filter @damm/engine run job >/dev/null
echo "raw aggregate row (the small n exists only here, HR code never reads this table):"
sqlite3 -header -column "$COPY" "SELECT a.periode, c.nom AS collectiu, a.n, a.mitjana, a.suprimit FROM agregat a JOIN collectiu c ON c.id=a.collectiu_id WHERE a.collectiu_id=$COLLECTIU AND a.periode='$PERIOD' AND a.torn_id IS NULL ORDER BY a.domini_id LIMIT 3;"
DB_PATH="$COPY" pnpm --filter @damm/engine run health || echo "(health reported a failure: read it above)"

bold "4/4  What HR code can see: the repository and the CSV export"
(cd packages/db && DB_PATH="$COPY" pnpm exec tsx "$ROOT/scripts/suppression-demo-read.mts" "$PERIOD" "$COLLECTIU")

bold "Done. Scratch copy left at $COPY (delete it with: rm -f $COPY*)"
