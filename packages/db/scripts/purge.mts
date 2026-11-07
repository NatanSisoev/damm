// Retention purge. Usage: DB_PATH=... tsx scripts/purge.mts [--dry-run]
// Dry run prints counts only and changes nothing.
import { getDb } from "../src/connection.ts";
import { purgeExpired } from "../src/retention.ts";

const dryRun = process.argv.includes("--dry-run");
const counts = purgeExpired(getDb(), { dryRun });
console.log(`${dryRun ? "DRY RUN (nothing deleted)" : "PURGED"}`, JSON.stringify(counts, null, 2));
