// Performance budgets at demo scale (about 350 accounts, the real question bank, 3 months of answers).
// Skip on slow machines with ENGINE_PERF=0. Takes about 40 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTIUS, DOMINIS } from "@damm/shared";
import { createEngine } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { createRng } from "../src/rng.ts";
import { one, run } from "../src/db.ts";
import type { SqlDatabase } from "../src/db.ts";
import { loadQuestionBank } from "../fixtures/load-question-bank.ts";
import { answerFor } from "./driver.ts";
import { DAY_MS, identity } from "./helpers.ts";

const SKIP = process.env.ENGINE_PERF === "0";
const ACCOUNTS = 350;
const DAYS = 92;
const BUDGET = { batchP95: 20, submitP95: 10, jobMs: 5000 };

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;
const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;

test("performance budgets at demo scale", { skip: SKIP ? "ENGINE_PERF=0" : false, timeout: 240_000 }, () => {
  const db = new DatabaseSync(":memory:") as unknown as SqlDatabase & { close(): void };
  db.exec(readFileSync(resolve(import.meta.dirname, "../../db/schema.sql"), "utf8"));
  DOMINIS.forEach((n, i) => run(db, "INSERT INTO domini (id, nom) VALUES (?, ?)", i + 1, n));
  COLLECTIUS.forEach((n, i) => run(db, "INSERT INTO collectiu (id, nom) VALUES (?, ?)", i + 1, n));
  ["mati", "tarda", "nit"].forEach((n, i) => run(db, "INSERT INTO torn (id, nom) VALUES (?, ?)", i + 1, n));
  ["fabrica", "magatzem", "oficina", "comercial"].forEach((n, i) => run(db, "INSERT INTO centre_tipus (id, nom) VALUES (?, ?)", i + 1, n));
  const rng = createRng("perf");
  const accounts: { id: string; base: number }[] = [];
  for (let i = 0; i < 1200; i++) {
    const c = (i % 4) + 1;
    const t = c === 4 ? null : (i % 3) + 1;
    run(db, "INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (?,?,?)", c, c, t);
    if (i < ACCOUNTS) {
      run(db, "INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, username, password_hash, salt) VALUES (?,?,?,?,?, 'x', 'x')", `p${i}`, c, c, t, `u${i}`);
      accounts.push({ id: `p${i}`, base: 0.45 + rng() * 0.35 });
    }
  }
  const loaded = loadQuestionBank(db);
  assert.ok(loaded > 100, `question bank has ${loaded} questions`);

  let now = Date.UTC(2026, 7, 1, 8, 0);
  const engine = createEngine({ db, redact: identity, now: () => now });
  const batchMs: number[] = [];
  const batchLate: number[] = [];
  const submitMs: number[] = [];
  const submitLate: number[] = [];
  let answers = 0;
  for (let d = 0; d < DAYS; d++, now += DAY_MS) {
    for (const a of accounts) {
      if (rng() >= 0.4) continue;
      let t = process.hrtime.bigint();
      const batch = engine.getDailyBatch(a.id);
      const tb = ms(t);
      (d >= DAYS - 14 ? batchLate : batchMs).push(tb);
      const todo = batch.items.map((i) => answerFor(i, a.base + (rng() - 0.5) * 0.2, rng));
      t = process.hrtime.bigint();
      const res = engine.submitAnswers(a.id, todo as never);
      const ts = ms(t);
      answers += res.accepted.length;
      // Per call, not per answer: the app submits a batch in one request.
      (d >= DAYS - 14 ? submitLate : submitMs).push(ts);
    }
  }
  const t = process.hrtime.bigint();
  const report = runEngineJob(db, { now });
  const jobMs = ms(t);
  const allBatch = [...batchMs, ...batchLate];
  const allSubmit = [...submitMs, ...submitLate];
  const total = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM resposta")!.n;
  console.log(
    `perf: ${ACCOUNTS} accounts, ${total} answers over ${DAYS} days | getDailyBatch p95 ${p95(allBatch).toFixed(2)} ms (last 2 weeks ${p95(batchLate).toFixed(2)}) | ` +
      `submitAnswers p95 ${p95(allSubmit).toFixed(2)} ms (last 2 weeks ${p95(submitLate).toFixed(2)}) | runEngineJob ${jobMs.toFixed(0)} ms (${report.aggregates} aggregates)`,
  );
  assert.ok(answers > 20_000, `only ${answers} answers`);
  assert.ok(p95(allBatch) < BUDGET.batchP95, `getDailyBatch p95 ${p95(allBatch).toFixed(2)} ms`);
  assert.ok(p95(batchLate) < BUDGET.batchP95, `getDailyBatch p95 (late) ${p95(batchLate).toFixed(2)} ms`);
  assert.ok(p95(allSubmit) < BUDGET.submitP95, `submitAnswers p95 ${p95(allSubmit).toFixed(2)} ms`);
  assert.ok(p95(submitLate) < BUDGET.submitP95, `submitAnswers p95 (late) ${p95(submitLate).toFixed(2)} ms`);
  assert.ok(jobMs < BUDGET.jobMs, `runEngineJob ${jobMs.toFixed(0)} ms`);
});
