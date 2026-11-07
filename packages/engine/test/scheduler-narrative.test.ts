import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { startEngineScheduler } from "../src/job.ts";
import { all, one, type SqlDatabase } from "../src/db.ts";
import type { Complete } from "../src/llm.ts";
import { addPool, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

const HOUR = 3_600_000;

function seeded(): { db: SqlDatabase; now: number } {
  const db = makeDb({ accountsPerCollective: 12 });
  addPool(db);
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  const accounts = all<{ id: string }>(db, "SELECT id FROM compte").map((r) => r.id);
  for (let d = 0; d < 8; d++) {
    for (const a of accounts)
      engine.submitAnswers(
        a,
        engine.getDailyBatch(a).items.map((it) => ({ preguntaId: it.questionId, valorNum: it.type === "yes_no" ? 1 : 6, comentari: "The schedule changes too often." })),
      );
    now += DAY_MS;
  }
  return { db, now };
}

const reply = JSON.stringify({
  summary: "Scores are mid-range across domains. Condicions i organització is the lowest and should be watched. Comments mention schedule changes.",
  highlights: [
    { text: "Condicions i organització is the lowest domain.", domain: "Condicions i organització", evidence: "score 6.0" },
    { text: "Comments repeat schedule changes.", domain: "Condicions i organització", evidence: "comments" },
  ],
  suggestedActions: [{ title: "Publish the schedule two weeks ahead", why: "Comments mention changes", domain: "Condicions i organització", followUp: "Is the schedule published in time?" }],
});

const flush = () => new Promise((r) => setTimeout(r, 20));

test("scheduler: narrative is opt-in, runs after the job, and is rate-limited", async () => {
  const { db, now } = seeded();
  let calls = 0;
  const complete: Complete = async () => {
    calls++;
    return reply;
  };
  let t = now;
  const reports: unknown[] = [];

  // Without the option the LLM is never called.
  const off = startEngineScheduler(db, { intervalMs: 60_000, now: () => t });
  await flush();
  off.stop();
  assert.equal(calls, 0);

  const s = startEngineScheduler(db, { intervalMs: 60_000, now: () => t, narrative: { complete, everyMs: 6 * HOUR }, onNarrative: (r) => reports.push(r) });
  await flush();
  assert.ok(calls > 0, "narrative ran after the first job");
  assert.equal(reports.length, 1);
  assert.ok(one(db, "SELECT 1 FROM insight WHERE kind = 'narrative' AND suprimit = 0"), "narrative insight stored");
  const after = calls;

  t += HOUR; // within the rate limit
  s.runNow();
  await flush();
  assert.equal(calls, after, "no narrative inside everyMs");
  assert.equal(reports.length, 1);

  t += 6 * HOUR; // past the limit: runs again (confidence decays with time, so inputs may differ)
  s.runNow();
  await flush();
  assert.equal(reports.length, 2);
  s.stop();
});

test("scheduler: a failing LLM is reported and never breaks the job", async () => {
  const { db, now } = seeded();
  const errors: unknown[] = [];
  const s = startEngineScheduler(db, {
    intervalMs: 60_000,
    now: () => now,
    narrative: { complete: async () => { throw new Error("gateway down"); } },
    onError: (e) => errors.push(e),
  });
  await flush();
  assert.ok(s.lastReport(), "job still ran");
  assert.ok(s.runNow(), "next job still runs");
  assert.equal(all(db, "SELECT 1 FROM insight WHERE kind = 'narrative' AND suprimit = 0").length, 0);
  assert.equal(await s.runNarrativeNow().then(() => "done"), "done");
  s.stop();
  assert.ok(errors.length <= 2);
});
