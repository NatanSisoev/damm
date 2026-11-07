// Writes LLM narrative insights for the latest period of DB_PATH (default data/app.db). Run after the engine job,
// at most a few times a day. Reads LLM_BASE_URL, LLM_API_KEY, LLM_MODEL from the environment or the repo root .env.
// Usage: pnpm --filter @damm/engine run narrative
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComplete, llmConfigFromEnv } from "../src/llm.ts";
import { runNarrative } from "../src/narrative.ts";

const root = resolve(import.meta.dirname, "../../..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
}

const path = process.env.DB_PATH ?? resolve(root, "data/app.db");
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
const config = llmConfigFromEnv();
const report = await runNarrative(db, { now: Date.now(), complete: createComplete(config), model: config.model });
console.log(JSON.stringify(report, null, 2));
db.close();
