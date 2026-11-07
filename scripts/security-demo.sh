#!/usr/bin/env bash
# Security demo, steps (a) and (b): plants a forbidden import in HR code, shows ESLint and
# `pnpm check:anonymity` failing, then removes it. A trap guarantees cleanup (also on Ctrl-C),
# so the git tree is left exactly as it was found.
#
# Run from anywhere:  bash scripts/security-demo.sh
# Pause between steps (live demo):  DEMO_PAUSE=1 bash scripts/security-demo.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLANTED_REL="apps/web/app/hr/zz-planted-violation.ts"
PLANTED="$ROOT/$PLANTED_REL"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
step() { bold "$*"; }
pause() { if [ "${DEMO_PAUSE:-}" = "1" ]; then read -r -p "  [Enter to continue] " _ || true; fi; }

cleanup() {
  rm -f "$PLANTED"
}
trap cleanup EXIT
trap 'echo; echo "interrupted"; exit 130' INT TERM

if [ -e "$PLANTED" ]; then
  echo "Refusing to run: $PLANTED_REL already exists. Delete it first." >&2
  exit 2
fi

before="$(git status --porcelain)"

step "(b) 1/2  Baseline: pnpm check:anonymity on the clean tree (expected: pass)"
pnpm check:anonymity
baseline=$?
echo "exit code: $baseline"
pause

step "Planting a forbidden import in HR code: $PLANTED_REL"
cat > "$PLANTED" <<'TS'
// TEMPORARY demo file, deleted automatically by scripts/security-demo.sh.
import { getDb } from "@damm/db";

export const leak = () => getDb().prepare("SELECT compte_id, valor_num FROM resposta").all();
TS
cat "$PLANTED_REL"
pause

step "(a)  ESLint on the planted file (expected: error, exit 1)"
(cd apps/web && pnpm exec eslint "app/hr/$(basename "$PLANTED_REL")")
echo "exit code: $?"
pause

step "(b) 2/2  pnpm check:anonymity with the planted file (expected: fail, exit 1)"
pnpm check:anonymity
echo "exit code: $?"
pause

step "Cleaning up"
cleanup
trap - EXIT

after="$(git status --porcelain)"
if [ "$before" = "$after" ]; then
  echo "Planted file removed. Git tree unchanged:"
  git status --short | sed 's/^/  /'
  [ -z "$after" ] && echo "  (clean)"
else
  echo "WARNING: git status differs from before the demo:" >&2
  git status --short >&2
  exit 1
fi

step "Re-running pnpm check:anonymity after cleanup (expected: pass)"
pnpm check:anonymity
