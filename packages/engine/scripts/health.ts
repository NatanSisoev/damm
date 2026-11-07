// Health check on a real database: ranges, suppression, no NaN, fresh job, alarms deduplicated. Exit code 1 on failure.
// Usage: pnpm --filter @damm/engine run health        (DB_PATH, default data/app.db; HEALTH_MAX_JOB_AGE_MIN, default 30)
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runHealth } from "./health-checks.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const given = process.env.DB_PATH ?? "data/app.db";
// A relative DB_PATH means relative to where you ran the command, else to the repo root (where the demo builder writes).
const path = [resolve(given), resolve(REPO, given)].find((p) => existsSync(p));
if (!path) {
  console.error(`FAIL  database not found: ${given}`);
  process.exit(1);
}

const db = new DatabaseSync(path, { readOnly: true });
let checks;
try {
  const maxJobAgeMin = process.env.HEALTH_MAX_JOB_AGE_MIN ? Number(process.env.HEALTH_MAX_JOB_AGE_MIN) : undefined;
  checks = runHealth(db as never, { maxJobAgeMin });
} catch (e) {
  console.error(`FAIL  could not read ${path}: ${(e as Error).message}`);
  process.exit(1);
} finally {
  db.close();
}

console.log(`Engine health: ${path}\n`);
for (const c of checks) console.log(`${c.status.toUpperCase().padEnd(4)}  ${c.name} — ${c.detail}`);
const failed = checks.filter((c) => c.status === "fail").length;
const warned = checks.filter((c) => c.status === "warn").length;
console.log(`\n${failed === 0 ? "HEALTHY" : "UNHEALTHY"}: ${checks.length - failed - warned} passed, ${warned} warnings, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
