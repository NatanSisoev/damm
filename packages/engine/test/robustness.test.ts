// Robustness: hostile input, missing data, time edge cases and concurrency never corrupt or crash the engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, one, run } from "../src/db.ts";
import type { SqlDatabase } from "../src/db.ts";
import { createEngine, EngineError } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";
import { dayOf } from "../src/time.ts";
import { cloneDb, dumpTable } from "./db-util.ts";
import { addPool, addQuestion, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";
import { generateWorld } from "./world-gen.ts";

const STATE = ["resposta", "person_domain_state", "item_stats", "format_stats", "assignment"];
const snapshot = (db: SqlDatabase) => STATE.map((t) => dumpTable(db, t));

/** A pool with one question of every type, all in domain 1..6 so one batch can hold several. */
function fullPool(db: SqlDatabase) {
  addQuestion(db, { domain: 1, type: "scale10", facet: "a" });
  addQuestion(db, { domain: 2, type: "scale5", facet: "b" });
  addQuestion(db, { domain: 3, type: "yes_no", facet: "c" });
  addQuestion(db, { domain: 4, type: "pair", facet: "d", options: [{ label: "x", score: 0 }, { label: "y", score: 1 }] });
  addQuestion(db, { domain: 5, type: "choice", facet: "e", options: [{ label: "x", score: 0.1 }, { label: "y", score: 0.5 }, { label: "z", score: 0.9 }] });
  addQuestion(db, { domain: 6, type: "ranking", facet: "f", options: [1, 2, 3].map((d) => ({ label: `o${d}`, domain_id: d })) });
  addQuestion(db, { domain: 1, type: "open", facet: "g" });
}

/** Bad payloads per question type. `valorNum`/`valueJson` are deliberately mistyped. */
const BAD: Record<string, Record<string, unknown>[]> = {
  scale10: [{ valorNum: Number.NaN }, { valorNum: Infinity }, { valorNum: -Infinity }, { valorNum: 11 }, { valorNum: -1 }, { valorNum: 1e308 }, { valorNum: 5.5 }, { valorNum: "7" }, { valorNum: null }, { valorNum: true }, { valorNum: [7] }, { valorNum: { v: 7 } }, {}, { valorNum: 2 ** 53 }],
  scale5: [{ valorNum: 0 }, { valorNum: 6 }, { valorNum: Number.NaN }, { valorNum: 3.1 }, { valorNum: "3" }, { valorNum: 1e12 }, {}],
  yes_no: [{ valorNum: 2 }, { valorNum: -1 }, { valorNum: 0.5 }, { valorNum: Number.NaN }, { valorNum: "1" }, { valorNum: false }, {}],
  pair: [{ valorNum: 2 }, { valorNum: -1 }, { valorNum: 0.5 }, { valorNum: Number.NaN }, { valorNum: 1e9 }, { valorNum: "0" }, {}],
  choice: [{ valorNum: 3 }, { valorNum: -1 }, { valorNum: 1.5 }, { valorNum: Number.NaN }, { valorNum: Infinity }, {}],
  ranking: [
    { valueJson: [0, 0, 1] }, { valueJson: [0, 1] }, { valueJson: [0, 1, 2, 3] }, { valueJson: [0, 1, 3] }, { valueJson: [-1, 0, 1] },
    { valueJson: [0, 1, 1.5] }, { valueJson: [0, 1, Number.NaN] }, { valueJson: ["0", "1", "2"] }, { valueJson: [] }, { valueJson: null },
    { valueJson: "012" }, { valorNum: 1 }, {},
  ],
  open: [{}, { comentari: "" }, { comentari: "   " }, { comentari: null }, { valorNum: 5 }],
};

test("malformed answers are rejected without throwing or writing anything", () => {
  // A day's batch holds one answer type, so each type gets its own DB with the other formats banned.
  // Open questions are never served; a legacy open assignment row is inserted by hand to keep the check.
  let tried = 0;
  for (const type of Object.keys(BAD)) {
    const db = makeDb();
    fullPool(db);
    addPool(db);
    run(db, "INSERT INTO engine_config (key, value) VALUES ('questions_per_day', '40')");
    for (const other of Object.keys(BAD)) if (other !== type) run(db, "INSERT INTO format_preference (collectiu_id, tipus, weight) VALUES (NULL, ?, 0)", other);
    const engine = createEngine({ db, redact: identity, now: () => T0 });
    const batch = engine.getDailyBatch("f1");
    if (type === "open") {
      assert.equal(batch.items.length, 0, "open questions are never in a batch");
      const id = one<{ id: number }>(db, "SELECT id FROM pregunta WHERE tipus = 'open'")!.id;
      run(db, "INSERT INTO assignment (compte_id, pregunta_id, day, slot, reason) VALUES ('f1', ?, ?, 0, 'monitor')", id, dayOf(T0, DEFAULT_CONFIG.timezone));
    } else {
      assert.ok(batch.items.length > 0 && batch.items.every((i) => i.type === type), `batch should be all ${type}`);
    }
    const before = snapshot(db);
    const items = type === "open" ? engine.getDailyBatch("f1").items : batch.items;
    assert.ok(items.length > 0, type);
    for (const item of items) {
      for (const bad of BAD[item.type] ?? []) {
        tried++;
        const res = engine.submitAnswers("f1", [{ preguntaId: item.questionId, ...bad } as never]);
        assert.deepEqual(res.accepted, [], `${item.type} accepted ${String(JSON.stringify(bad))}`);
        assert.equal(res.rejected.length, 1);
        assert.ok(["invalid_value", "missing_comment"].includes(res.rejected[0]!.reason), `${item.type}: ${res.rejected[0]!.reason}`);
      }
    }
    assert.deepEqual(snapshot(db), before, "a rejected answer must not change any table");
    assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM assignment WHERE answered_at IS NOT NULL")?.n, 0);
  }
  assert.ok(tried > 50);
});

test("garbage question ids and entries inside the answers list never throw", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  engine.getDailyBatch("f1");
  const before = snapshot(db);
  const junk = [
    { preguntaId: Number.NaN, valorNum: 1 }, { preguntaId: -1, valorNum: 1 }, { preguntaId: 1e99, valorNum: 1 }, { preguntaId: "1" as never, valorNum: 1 },
    { preguntaId: null as never }, { valorNum: 3 } as never, null as never, undefined as never, 7 as never, "x" as never,
  ];
  let res: ReturnType<typeof engine.submitAnswers> | undefined;
  assert.doesNotThrow(() => (res = engine.submitAnswers("f1", junk)));
  assert.deepEqual(res!.accepted, []);
  assert.equal(res!.rejected.length, junk.length);
  assert.doesNotThrow(() => engine.submitAnswers("f1", []));
  assert.doesNotThrow(() => engine.submitAnswers("f1", undefined as never));
  assert.deepEqual(snapshot(db), before);
});

test("a valid answer with hostile side fields is stored sanitised or the answer rejected, never corrupt", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const b = engine.getDailyBatch("f2");
  const answer = (item: (typeof b.items)[number], extra: Record<string, unknown>) =>
    ({ preguntaId: item.questionId, valorNum: item.type === "yes_no" ? 1 : 6, ...extra }) as never;
  const extras: Record<string, unknown>[] = [
    { answerMs: Number.NaN }, { answerMs: Infinity }, { answerMs: -5 }, { answerMs: 1e300 }, { answerMs: "fast" }, { comentari: 42 }, { comentari: { a: 1 } }, { comentari: "x".repeat(200_000) },
  ];
  for (const [i, extra] of extras.entries()) {
    const item = b.items[i % b.items.length]!;
    const fresh = makeDb();
    addPool(fresh);
    const e = createEngine({ db: fresh, redact: identity, now: () => T0 });
    const bf = e.getDailyBatch("f2");
    assert.doesNotThrow(() => e.submitAnswers("f2", [answer(bf.items[i % bf.items.length]!, extra)]), JSON.stringify(extra).slice(0, 40));
    const row = one<{ answer_ms: number | null; comentari: string | null; score: number }>(fresh, "SELECT answer_ms, comentari, score FROM resposta");
    if (row) {
      assert.ok(row.answer_ms === null || (Number.isFinite(row.answer_ms) && row.answer_ms >= 0 && row.answer_ms < 1e12), `answer_ms ${row.answer_ms} for ${JSON.stringify(extra).slice(0, 40)}`);
      assert.ok(row.score >= 0 && row.score <= 1);
      assert.ok(row.comentari === null || typeof row.comentari === "string");
    }
    void item;
  }
});

test("an unknown account throws EngineError from both calls", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  assert.throws(() => engine.getDailyBatch("nobody"), EngineError);
  assert.throws(() => engine.submitAnswers("nobody", [{ preguntaId: 1, valorNum: 1 }]), EngineError);
  assert.throws(() => engine.getDailyBatch(""), EngineError);
  assert.throws(() => engine.getDailyBatch(undefined as never), (e) => e instanceof EngineError || e instanceof TypeError);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM assignment")?.n, 0);
});

test("an empty question pool gives an empty batch, and nothing can be submitted", () => {
  const db = makeDb();
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const b = engine.getDailyBatch("f0");
  assert.deepEqual(b, { day: "2026-10-01", total: 0, answered: 0, items: [] });
  const res = engine.submitAnswers("f0", [{ preguntaId: 1, valorNum: 5 }]);
  assert.deepEqual(res.accepted, []);
  assert.equal(res.rejected[0]!.reason, "not_in_todays_batch");
  assert.doesNotThrow(() => runEngineJob(db, { now: T0 }));
  // Draft or archived questions are not a pool either.
  db.prepare("INSERT INTO pregunta (domini_id, text, tipus, estat) VALUES (1, 'draft', 'scale10', 'draft')").run();
  assert.equal(engine.getDailyBatch("f1").total, 0);
});

test("a pool smaller than questions_per_day gives a short batch, never duplicates", () => {
  const db = makeDb();
  addQuestion(db, { domain: 1, type: "scale10", facet: "a" });
  addQuestion(db, { domain: 2, type: "scale10", facet: "b" });
  const b = createEngine({ db, redact: identity, now: () => T0 }).getDailyBatch("f0");
  assert.equal(b.total, 2);
  assert.equal(new Set(b.items.map((i) => i.questionId)).size, 2);
});

test("a corrupt engine_config row falls back to the default", () => {
  const corrupt: [string, string, keyof typeof DEFAULT_CONFIG][] = [
    ["questions_per_day", "not json {", "questionsPerDay"],
    ["questions_per_day", '"three"', "questionsPerDay"],
    ["questions_per_day", "-4", "questionsPerDay"],
    ["questions_per_day", "null", "questionsPerDay"],
    ["questions_per_day", "1e999", "questionsPerDay"],
    ["timezone", "123", "timezone"],
    ["timezone", '""', "timezone"],
    ["followup_trigger_types", '["scale10","bogus"]', "followupTriggerTypes"],
    ["noise_sd", '{"scale10": -1}', "noiseSd"],
    ["priors", '{"level": 7}', "priors"],
    ["priors", "[]", "priors"],
    ["half_life_days", "{}", "halfLifeDays"],
  ];
  for (const [key, value, field] of corrupt) {
    const db = makeDb();
    addPool(db);
    run(db, "INSERT INTO engine_config (key, value) VALUES (?, ?)", key, value);
    const cfg = loadConfig(db);
    assert.deepEqual(cfg[field], DEFAULT_CONFIG[field], `${key}=${value}`);
    const engine = createEngine({ db, redact: identity, now: () => T0 });
    assert.equal(engine.getDailyBatch("f0").total, DEFAULT_CONFIG.questionsPerDay, `${key}=${value}`);
    assert.doesNotThrow(() => runEngineJob(db, { now: T0 }), `${key}=${value}`);
  }
  // Unknown keys are ignored.
  const db = makeDb();
  run(db, "INSERT INTO engine_config (key, value) VALUES ('mystery', '{{')");
  assert.deepEqual(loadConfig(db), DEFAULT_CONFIG);
});

test("a corrupt timezone setting never breaks day arithmetic permanently", () => {
  const db = makeDb();
  addPool(db);
  run(db, "INSERT INTO engine_config (key, value) VALUES ('timezone', '\"Mars/Olympus\"')");
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  // Intl throws a RangeError for unknown zones; the contract is only that it is a clear error, not corrupt data.
  try {
    engine.getDailyBatch("f0");
  } catch (e) {
    assert.ok(e instanceof Error);
  }
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM resposta")?.n, 0);
});

test("DST change day (2026-10-25, Europe/Madrid, 25 hours): one batch per local day, no skipped day", () => {
  const db = makeDb();
  addPool(db);
  let now = Date.UTC(2026, 9, 23, 20, 0, 0);
  const engine = createEngine({ db, redact: identity, now: () => now });
  const seen: string[] = [];
  const perDay = new Map<string, number[]>();
  // Visit every hour from 23 Oct 20:00Z to 28 Oct 00:00Z.
  for (; now < Date.UTC(2026, 9, 28); now += 3_600_000) {
    const b = engine.getDailyBatch("f0");
    seen.push(b.day);
    perDay.set(b.day, b.items.map((i) => i.questionId));
    const expected = dayOf(now, "Europe/Madrid");
    assert.equal(b.day, expected);
    assert.deepEqual(b.items.map((i) => i.questionId), perDay.get(b.day), "same batch all day");
    assert.equal(b.total, 3);
  }
  const days = [...new Set(seen)];
  assert.deepEqual(days, ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM assignment WHERE day = '2026-10-25'")?.n, 3);
  // The 25-hour day: a morning answer and an evening answer land in the same batch, the second is "already answered".
  now = Date.UTC(2026, 9, 25, 1, 30); // 02:30 CET, second pass through 02:30
  const b = engine.getDailyBatch("f0");
  const first = b.items[0]!;
  const ok = engine.submitAnswers("f0", [{ preguntaId: first.questionId, valorNum: first.type === "yes_no" ? 1 : 5 }]);
  assert.deepEqual(ok.accepted, [first.questionId]);
  now = Date.UTC(2026, 9, 25, 22, 30); // 23:30 CET, still the 25th
  assert.equal(engine.getDailyBatch("f0").answered, 1);
  assert.equal(engine.submitAnswers("f0", [{ preguntaId: first.questionId, valorNum: 3 }]).rejected[0]!.reason, "already_answered");
});

test("spring DST change (2027-03-28) and the year boundary keep days consecutive", () => {
  const db = makeDb();
  addPool(db);
  let now = Date.UTC(2027, 2, 26, 12, 0, 0);
  const engine = createEngine({ db, redact: identity, now: () => now });
  const days: string[] = [];
  for (let i = 0; i < 5; i++, now += DAY_MS) days.push(engine.getDailyBatch("f0").day);
  assert.deepEqual(days, ["2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29", "2027-03-30"]);
  now = Date.UTC(2026, 11, 31, 22, 59);
  assert.equal(engine.getDailyBatch("f0").day, "2026-12-31");
  now = Date.UTC(2026, 11, 31, 23, 0);
  assert.equal(engine.getDailyBatch("f0").day, "2027-01-01");
});

test("month boundary: answers after local midnight belong to the new month and the job agrees with the live engine", () => {
  // 23:30 UTC on the 31st is 00:30 / 01:30 local on the 1st: the UTC date and the local day differ.
  const w = generateWorld("month-edge", { accountsPerCollective: 14, days: 70, start: Date.UTC(2026, 8, 28, 23, 30), participation: 0.9, withComments: false, junk: 0 });
  const rows = all<{ periode: string; data: string }>(w.db, "SELECT DISTINCT periode, substr(data,1,7) AS data FROM resposta");
  assert.ok(rows.some((r) => r.periode !== r.data), "scenario must contain answers whose UTC month differs from the local month");
  const copy = cloneDb(w.db);
  copy.exec("DELETE FROM person_domain_state; DELETE FROM item_stats");
  runEngineJob(copy, { now: w.clock.now });
  const live = all<Record<string, number | string | null>>(w.db, "SELECT * FROM person_domain_state ORDER BY compte_id, domini_id");
  const replay = all<Record<string, number | string | null>>(copy, "SELECT * FROM person_domain_state ORDER BY compte_id, domini_id");
  assert.equal(replay.length, live.length);
  for (const [i, l] of live.entries()) {
    const r = replay[i]!;
    for (const k of Object.keys(l)) {
      const x = l[k];
      const y = r[k];
      if (typeof x === "number" && typeof y === "number") assert.ok(Math.abs(x - y) <= 1e-9, `${l.compte_id}/${l.domini_id}.${k}: live ${x} vs replay ${y}`);
      else assert.equal(y, x, `${l.compte_id}/${l.domini_id}.${k}`);
    }
  }
  // Periods in the aggregates are the local months.
  const periods = all<{ periode: string }>(w.db, "SELECT DISTINCT periode FROM agregat ORDER BY periode").map((p) => p.periode);
  assert.deepEqual(periods, ["2026-09", "2026-10", "2026-11", "2026-12"].slice(0, periods.length));
});

test("two getDailyBatch calls racing for the same account create one batch", async () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const [a, b] = await Promise.all([Promise.resolve().then(() => engine.getDailyBatch("f3")), Promise.resolve().then(() => engine.getDailyBatch("f3"))]);
  assert.deepEqual(a, b);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM assignment WHERE compte_id = 'f3'")?.n, 3);
});

test("a competing request that wins the insert in between is adopted, not duplicated", () => {
  const db = makeDb();
  addPool(db);
  const questions = all<{ id: number }>(db, "SELECT id FROM pregunta ORDER BY id DESC LIMIT 3").map((q) => q.id);
  let injected = false;
  // Proxy: just before this engine's first assignment INSERT, "another request" commits a different batch for the same account and day.
  const racing = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "prepare") {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      }
      return (sql: string) => {
        if (!injected && sql.startsWith("INSERT OR IGNORE INTO assignment")) {
          injected = true;
          questions.forEach((q, slot) => target.prepare("INSERT INTO assignment (compte_id, pregunta_id, day, slot, reason) VALUES ('f4', ?, '2026-10-01', ?, 'monitor')").run(q, slot));
        }
        return target.prepare(sql);
      };
    },
  });
  const engine = createEngine({ db: racing, redact: identity, now: () => T0 });
  const batch = engine.getDailyBatch("f4");
  assert.ok(injected);
  assert.equal(batch.total, 3);
  assert.deepEqual(batch.items.map((i) => i.questionId), questions, "the winner's batch is served");
  const rows = all<{ slot: number }>(db, "SELECT slot FROM assignment WHERE compte_id = 'f4'");
  assert.equal(rows.length, 3);
  assert.deepEqual(engine.getDailyBatch("f4").items.map((i) => i.questionId), questions);
});

test("a throwing redactor aborts the submit atomically", () => {
  const db = makeDb();
  addPool(db);
  let boom = false;
  const engine = createEngine({ db, redact: (s) => { if (boom) throw new Error("redactor down"); return s; }, now: () => T0 });
  const b = engine.getDailyBatch("f5");
  const before = snapshot(db);
  boom = true;
  const answers = b.items.map((i) => ({ preguntaId: i.questionId, valorNum: i.type === "yes_no" ? 1 : 6, comentari: "needs redaction" }));
  assert.throws(() => engine.submitAnswers("f5", answers), /redactor down/);
  assert.deepEqual(snapshot(db), before, "no half-saved answers when the redactor fails");
  boom = false;
  assert.equal(engine.submitAnswers("f5", answers).accepted.length, 3, "the engine still works afterwards");
});
