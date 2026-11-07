// Runs the engine job against DB_PATH (default data/app.db, relative to the repo root).
// Usage: pnpm --filter @damm/engine run job
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { runEngineJob } from "../src/job.ts";
import { runRecommendations } from "../src/recommendations.ts";
import { draftRecommendations } from "../../ai/src/recommendations.ts";

const path = process.env.DB_PATH ?? resolve(import.meta.dirname, "../../../data/app.db");
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
const report = runEngineJob(db);
// Proposals for open alarms. Uses the LLM when LLM_BASE_URL and LLM_API_KEY are set, the template library otherwise.
const recommendations = await runRecommendations(db, { now: Date.now(), draft: (ctx) => draftRecommendations(ctx) });
console.log(JSON.stringify({ ...report, recommendations }, null, 2));
db.close();
