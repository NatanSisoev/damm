// Runs the engine job against DB_PATH (default data/app.db, relative to the repo root).
// Usage: pnpm --filter @damm/engine run job
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runEngineJob } from "../src/job.ts";
import { runCommentAnalysisSync } from "../src/comments.ts";
import { runRecommendations } from "../src/recommendations.ts";
import { draftRecommendations } from "../../ai/src/recommendations.ts";

// A relative DB_PATH is relative to where you ran the command, else to the repo root. Never creates a new file.
const given = process.env.DB_PATH ?? "data/app.db";
const path = [resolve(given), resolve(import.meta.dirname, "../../..", given)].find((p) => existsSync(p));
if (!path) {
  console.error(`database not found: ${given}`);
  process.exit(1);
}
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
const report = runEngineJob(db);
// Deterministic comment themes, summaries and emergent alarms (use `run comments` for the optional LLM path).
const comments = runCommentAnalysisSync(db, { now: Date.now() });
// Proposals for open alarms. Uses the LLM when LLM_BASE_URL and LLM_API_KEY are set, the template library otherwise.
const recommendations = await runRecommendations(db, { now: Date.now(), draft: (ctx) => draftRecommendations(ctx) });
console.log(JSON.stringify({ ...report, comments, recommendations }, null, 2));
db.close();
