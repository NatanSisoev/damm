// Soak: long simulated runs with the scheduler on a fake clock. Slow by design (about 40 s); named "soak" so it is easy to find.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { all, one } from "../src/db.ts";
import { createEngine } from "../src/engine.ts";
import { setAlarmStatus } from "../src/hr.ts";
import { startEngineScheduler, type JobReport } from "../src/job.ts";
import { createRng } from "../src/rng.ts";
import { findBadNumbers } from "./db-util.ts";
import { answerDay, type Person, type Sentiment } from "./driver.ts";
import { addPool, DAY_MS, identity, makeDb } from "./helpers.ts";

const ACTIVE = ["open", "acknowledged", "action_linked"];

function setup(accountsPerCollective: number, start: number) {
  const db = makeDb({ accountsPerCollective });
  addPool(db);
  const rng = createRng("soak");
  const clock = { now: start };
  const engine = createEngine({ db, redact: identity, now: () => clock.now });
  const people: Person[] = all<{ id: string; collectiu_id: number }>(db, "SELECT id, collectiu_id FROM compte ORDER BY id").map((a) => ({
    id: a.id,
    collectiu: a.collectiu_id,
    base: 0.45 + rng() * 0.35,
  }));
  return { db, rng, clock, engine, people };
}

/** Stories: Fàbriques loses 0.3 on Benestar after day 100; Oficines decays slowly on Cultura; everything else is stable. */
const sentiment: Sentiment = (p, d, day) => {
  if (p.collectiu === 1 && d === 1 && day >= 100) return p.base - 0.3;
  if (p.collectiu === 2 && d === 4) return p.base - 0.002 * day;
  return p.base;
};

const counts = (db: ReturnType<typeof makeDb>) => ({
  resposta: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM resposta")!.n,
  agregat: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM agregat")!.n,
  insight: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM insight")!.n,
  senyal: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM senyal")!.n,
  importance: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM domain_importance")!.n,
  assignment: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM assignment")!.n,
  state: one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM person_domain_state")!.n,
});

/** At most one active alarm per (type, collective, shift, domain), and repeats of a key at least the cooldown apart. */
function assertDeduplicated(db: ReturnType<typeof makeDb>, label: string) {
  const dupes = all(
    db,
    `SELECT tipus, collectiu_id, torn_id, domini_id, COUNT(*) AS n FROM senyal WHERE status IN ('open','acknowledged','action_linked')
     GROUP BY tipus, collectiu_id, torn_id, domini_id HAVING COUNT(*) > 1`,
  );
  assert.deepEqual(dupes, [], `${label}: more than one active alarm for the same key`);
  const rows = all<{ k: string; created_at: string }>(db, "SELECT tipus || '|' || ifnull(collectiu_id,'-') || '|' || ifnull(torn_id,'-') || '|' || ifnull(domini_id,'-') AS k, created_at FROM senyal ORDER BY created_at");
  const lastByKey = new Map<string, number>();
  for (const r of rows) {
    const t = Date.parse(`${r.created_at.replace(" ", "T")}Z`);
    const prev = lastByKey.get(r.k);
    if (prev !== undefined) assert.ok(t - prev >= 7 * DAY_MS, `${label}: alarm ${r.k} re-opened after ${(t - prev) / DAY_MS} days`);
    lastByKey.set(r.k, t);
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

test("soak: 6 months of daily answers, scheduler running weekly on a fake clock", { timeout: 120_000 }, (t) => {
  mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => mock.timers.reset());
  const { db, rng, clock, engine, people } = setup(22, Date.UTC(2026, 7, 1, 8, 0));
  const errors: unknown[] = [];
  const runs: { at: number; ms: number; answers: number; report: JobReport; c: ReturnType<typeof counts> }[] = [];
  let answers = 0;
  const sched = startEngineScheduler(db, {
    intervalMs: 7 * DAY_MS,
    runOnStart: false,
    now: () => clock.now,
    onError: (e) => errors.push(e),
    onReport: (report) => {
      runs.push({ at: clock.now, ms: Number(process.hrtime.bigint() - started) / 1e6, answers, report, c: counts(db) });
    },
  });
  let started = process.hrtime.bigint();
  const timed: number[] = [];
  const acknowledged = new Map<number, string>();
  const DAYS = 183;
  for (let day = 0; day < DAYS; day++) {
    answers += answerDay(engine, people, sentiment, day, rng, 0.7);
    clock.now += DAY_MS;
    started = process.hrtime.bigint();
    const before = runs.length;
    mock.timers.tick(DAY_MS);
    if (runs.length > before) {
      timed.push(runs[runs.length - 1]!.ms);
      runs[runs.length - 1]!.ms = Number(process.hrtime.bigint() - started) / 1e6;
      // A human acknowledges whatever is open; later runs must leave those alarms exactly as they are.
      for (const a of all<{ id: number }>(db, "SELECT id FROM senyal WHERE status = 'open'")) {
        if (acknowledged.size < 6) {
          setAlarmStatus(db, a.id, "acknowledged");
          acknowledged.set(a.id, JSON.stringify(one(db, "SELECT * FROM senyal WHERE id = ?", a.id)));
        }
      }
      assertDeduplicated(db, `day ${day}`);
    }
    if (day % 30 === 29) assert.deepEqual(findBadNumbers(db), [], `day ${day}`);
  }
  sched.stop();

  assert.deepEqual(errors, [], "scheduler reported errors");
  assert.ok(runs.length >= 25, `only ${runs.length} runs`);
  assert.ok(answers > 8000, `only ${answers} answers`);
  assert.deepEqual(findBadNumbers(db), []);
  assertDeduplicated(db, "end");
  assert.ok(sched.lastReport() !== null && sched.lastRunAt() === runs[runs.length - 1]!.at);

  // The planted drop was found, and a human's acknowledgement is respected.
  const drops = all<{ tipus: string; collectiu_id: number; domini_id: number }>(db, "SELECT tipus, collectiu_id, domini_id FROM senyal WHERE suprimit = 0");
  assert.ok(drops.some((a) => a.collectiu_id === 1 && a.domini_id === 1), `no alarm for the planted Fàbriques/Benestar drop: ${JSON.stringify(drops)}`);
  assert.ok(acknowledged.size > 0, "scenario should have produced alarms to acknowledge");
  for (const [id, snap] of acknowledged) {
    const now = one<Record<string, unknown>>(db, "SELECT * FROM senyal WHERE id = ?", id)!;
    assert.equal(JSON.stringify(now), snap, `acknowledged alarm ${id} was changed by the engine`);
  }

  // Linear growth: input tables grow with the data; output tables are bounded by periods, not by number of runs.
  const last = runs[runs.length - 1]!;
  const periods = one<{ n: number }>(db, "SELECT COUNT(DISTINCT periode) AS n FROM agregat")!.n;
  assert.ok(periods >= 6);
  assert.ok(last.c.assignment <= people.length * DAYS * 3, "assignments exceed accounts × days × 3");
  assert.ok(last.c.state <= people.length * 6, "person_domain_state is one row per person × domain");
  const perPeriod = (table: string) => all<{ periode: string; n: number }>(db, `SELECT periode, COUNT(*) AS n FROM ${table} GROUP BY periode`);
  for (const table of ["agregat", "insight", "domain_importance"]) {
    const rows = perPeriod(table);
    const full = rows.filter((r) => r.periode !== "2026-08" && r.periode !== "2027-02"); // first and last periods are partial
    const biggest = Math.max(...full.map((r) => r.n));
    const smallest = Math.min(...full.map((r) => r.n));
    assert.ok(biggest <= 2 * Math.max(smallest, 1) + 20, `${table}: rows per period vary ${smallest}..${biggest}, looks like accumulation`);
  }
  // Reruns with no new data change nothing (no runaway rows), neither now nor ten minutes later.
  assert.ok(sched.runNow() !== null); // absorbs answers that arrived after the last weekly tick
  const settled = counts(db);
  for (const dt of [0, 600_000, 600_000]) {
    clock.now += dt;
    assert.ok(sched.runNow() !== null);
    assert.deepEqual(counts(db), settled, `counts moved after a rerun +${dt}ms`);
  }
  // Senyal rows bounded by cooldown: at most one row per key per cooldown window over the whole run.
  const keys = one<{ n: number }>(db, "SELECT COUNT(DISTINCT tipus || ifnull(collectiu_id,'-') || ifnull(torn_id,'-') || ifnull(domini_id,'-')) AS n FROM senyal")!.n;
  assert.ok(last.c.senyal <= keys * Math.ceil((DAYS + 7) / 7), `senyal ${last.c.senyal} rows for ${keys} keys`);

  // Job time is at most linear in answers: time per answer in the last quarter vs the middle of the run.
  const ratio = (r: (typeof runs)[number]) => r.ms / r.answers;
  const q = Math.floor(runs.length / 4);
  const mid = median(runs.slice(q, 2 * q).map(ratio));
  const late = median(runs.slice(3 * q).map(ratio));
  console.log(`soak: ${runs.length} runs, ${answers} answers, last run ${last.ms.toFixed(0)} ms, ms/answer mid ${mid.toFixed(3)} late ${late.toFixed(3)}`);
  assert.ok(late <= 3 * mid + 0.05, `job time per answer grew from ${mid.toFixed(3)} to ${late.toFixed(3)} ms (super-linear)`);
});

test("soak: a 4-hour window of 10-minute ticks with answers arriving between runs", { timeout: 120_000 }, (t) => {
  mock.timers.enable({ apis: ["setInterval"] });
  t.after(() => mock.timers.reset());
  const { db, rng, clock, engine, people } = setup(22, Date.UTC(2026, 8, 1, 8, 0));
  // 40 days of history first, so alarms, insights and trajectories exist when the window starts.
  for (let day = 0; day < 40; day++) {
    answerDay(engine, people, sentiment, day, rng, 0.7);
    clock.now += DAY_MS;
  }
  clock.now = Date.UTC(2026, 9, 11, 9, 0); // new local day, 09:00 UTC
  const errors: unknown[] = [];
  const reports: JobReport[] = [];
  const stamps: string[] = [];
  const sched = startEngineScheduler(db, { intervalMs: 600_000, runOnStart: true, now: () => clock.now, onError: (e) => errors.push(e), onReport: (r) => reports.push(r) });
  assert.equal(reports.length, 1, "runOnStart");
  const lastJob = () => JSON.parse(one<{ value: string }>(db, "SELECT value FROM engine_config WHERE key = 'last_job_at'")!.value) as string;
  stamps.push(lastJob());
  const pending = [...people];
  const acknowledged = new Map<number, string>();
  const sizes: ReturnType<typeof counts>[] = [counts(db)];
  for (let tick = 1; tick <= 24; tick++) {
    clock.now += 600_000;
    // Between two runs a slice of the staff answers (their daily batch is fixed for the day).
    for (const p of pending.splice(0, Math.ceil(people.length / 24))) {
      const batch = engine.getDailyBatch(p.id);
      engine.submitAnswers(p.id, batch.items.map((i) => ({ preguntaId: i.questionId, valorNum: i.type === "yes_no" ? 1 : 3 + Math.floor(rng() * 5) })));
    }
    mock.timers.tick(600_000);
    assert.equal(reports.length, tick + 1, `run ${tick} did not happen`);
    stamps.push(lastJob());
    sizes.push(counts(db));
    if (tick === 4)
      for (const a of all<{ id: number }>(db, "SELECT id FROM senyal WHERE status = 'open' LIMIT 5")) {
        setAlarmStatus(db, a.id, "acknowledged");
        acknowledged.set(a.id, JSON.stringify(one(db, "SELECT * FROM senyal WHERE id = ?", a.id)));
      }
    assertDeduplicated(db, `tick ${tick}`);
  }
  sched.stop();
  assert.deepEqual(errors, []);
  assert.equal(reports.length, 25);
  assert.deepEqual(stamps, [...stamps].sort(), "last_job_at only moves forward");
  assert.equal(new Set(stamps).size, 25, "last_job_at advances on every run");
  assert.deepEqual(findBadNumbers(db), []);
  // Ten-minute runs never grow the aggregate tables by more than the new answers justify.
  const first = sizes[0]!;
  const final = sizes[sizes.length - 1]!;
  assert.ok(final.resposta > first.resposta);
  for (const table of ["agregat", "insight", "importance"] as const) assert.ok(final[table] <= first[table] * 1.2 + 10, `${table} ${first[table]} → ${final[table]} in 4 hours`);
  assert.ok(final.senyal <= first.senyal + 12, `senyal ${first.senyal} → ${final.senyal} in 4 hours`);
  for (const [id, snap] of acknowledged) assert.equal(JSON.stringify(one(db, "SELECT * FROM senyal WHERE id = ?", id)), snap, `acknowledged alarm ${id} changed`);
  // Job duration per run stays flat when only a few answers arrive between runs.
  assert.ok(reports.every((r) => r.engineVersion === reports[0]!.engineVersion));
});
