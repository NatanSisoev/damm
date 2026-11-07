// Runs the comment analysis against DB_PATH (default data/app.db). Uses the LLM when LLM_BASE_URL and LLM_API_KEY
// are set (packages/ai, loaded dynamically so the engine has no dependency on it); otherwise the lexicon and templates.
// Usage: pnpm --filter @damm/engine run comments
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { runCommentAnalysis } from "../src/comments.ts";

const path = process.env.DB_PATH ?? resolve(import.meta.dirname, "../../../data/app.db");
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
let llm: { classify?: never; summarise?: never } | Record<string, unknown> = {};
if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY && !process.argv.includes("--no-llm")) {
  try {
    const spec = "../../ai/src/index.ts"; // variable path: keeps packages/ai out of the engine typecheck
    const ai = await import(spec);
    llm = { classify: ai.classifyCommentsLlm, summarise: ai.summariseThemeLlm };
  } catch (e) {
    console.error("LLM helpers not available, using rules:", e instanceof Error ? e.message : e);
  }
}
console.log(JSON.stringify(await runCommentAnalysis(db, { now: Date.now(), ...llm }), null, 2));
db.close();
