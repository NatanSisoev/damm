// Runs the engine job against DB_PATH (default data/app.db, relative to the repo root).
// Usage: pnpm --filter @damm/engine run job
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { runEngineJob } from "../src/job.ts";

const path = process.env.DB_PATH ?? resolve(import.meta.dirname, "../../../data/app.db");
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
const report = runEngineJob(db);
console.log(JSON.stringify(report, null, 2));
db.close();
