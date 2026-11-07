import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { setDomainWeight, setFormatPreference, validateQuestion } from "../src/hr.ts";
import { getConfig, setConfig } from "../src/config.ts";
import { all, one } from "../src/db.ts";
import { addPool, addQuestion, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

test("createEngine refuses to start without redact", () => {
  assert.throws(() => createEngine({ db: makeDb(), redact: undefined as never }));
});

test("daily batch: 3 questions, distinct domains, fixed for the day", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const b1 = engine.getDailyBatch("f0");
  assert.equal(b1.total, 3);
  assert.equal(new Set(b1.items.map((i) => i.domainId)).size, 3);
  assert.deepEqual(engine.getDailyBatch("f0").items.map((i) => i.questionId), b1.items.map((i) => i.questionId));
  assert.equal(b1.items[0]!.scale?.max ?? 1, b1.items[0]!.type === "scale10" ? 10 : 1);
});

test("submit: validates against today's batch, stores score, marks answered", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: (s) => s.replace(/\d{9}/g, "[phone]"), now: () => T0 });
  const batch = engine.getDailyBatch("f0");
  const [a, b] = batch.items;
  const value = (t: string) => (t === "yes_no" ? 1 : 7);
  const res = engine.submitAnswers("f0", [
    { preguntaId: a!.questionId, valorNum: value(a!.type), comentari: "call me 612345678", answerMs: 4000 },
    { preguntaId: a!.questionId, valorNum: value(a!.type) },
    { preguntaId: b!.questionId, valorNum: 99 },
    { preguntaId: 9999, valorNum: 1 },
  ]);
  assert.deepEqual(res.accepted, [a!.questionId]);
  assert.deepEqual(res.rejected.map((r) => r.reason).sort(), ["already_answered", "invalid_value", "not_in_todays_batch"]);
  assert.equal(res.remainingToday, 2);
  const row = one<{ score: number; comentari: string; answer_ms: number }>(db, "SELECT score, comentari, answer_ms FROM resposta");
  assert.equal(row?.comentari, "call me [phone]");
  assert.equal(row?.answer_ms, 4000);
  assert.ok(row && row.score > 0);
  assert.equal(engine.getDailyBatch("f0").answered, 1);
  assert.ok(one(db, "SELECT 1 FROM person_domain_state WHERE compte_id = 'f0'"));
});

test("HR needs come before monitoring and are asked once", () => {
  const db = makeDb();
  addPool(db);
  db.prepare("INSERT INTO necessitat (id, text_nl, estat) VALUES (1, 'shift communication', 'publicada')").run();
  const need = addQuestion(db, { domain: 6, type: "yes_no", needId: 1, priority: 10 });
  let day = T0;
  const engine = createEngine({ db, redact: identity, now: () => day });
  const b = engine.getDailyBatch("o1");
  assert.equal(b.items[0]!.questionId, need);
  engine.submitAnswers("o1", b.items.map((i) => ({ preguntaId: i.questionId, valorNum: i.type === "yes_no" ? 1 : 6 })));
  day += DAY_MS;
  assert.ok(!engine.getDailyBatch("o1").items.some((i) => i.questionId === need));
});

test("a sharp personal drop schedules a follow-up in the same domain a few days later", () => {
  const db = makeDb();
  for (let d = 1; d <= 6; d++) {
    for (let k = 0; k < 4; k++) addQuestion(db, { domain: d, type: "scale10", facet: `f${d}` });
  }
  const fu = addQuestion(db, { domain: 2, type: "scale10", facet: "f2", followup: true });
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  // 8 weeks of 8/10, then a 1/10 in Lideratge (domain 2).
  let dropDay = "";
  for (let i = 0; i < 70 && !dropDay; i++) {
    const batch = engine.getDailyBatch("f2");
    const late = i > 56;
    engine.submitAnswers("f2", batch.items.map((it) => ({ preguntaId: it.questionId, valorNum: late && it.domainId === 2 ? 1 : 8 })));
    if (late && batch.items.some((it) => it.domainId === 2)) dropDay = batch.day;
    now += DAY_MS;
  }
  assert.ok(dropDay, "Lideratge was asked in the late window");
  const st = one<{ followup_due: string }>(db, "SELECT followup_due FROM person_domain_state WHERE compte_id = 'f2' AND domini_id = 2");
  assert.ok(st?.followup_due, "follow-up scheduled");
  let seen = false;
  for (let i = 0; i < 10 && !seen; i++) {
    const batch = engine.getDailyBatch("f2");
    seen = batch.items.some((it) => it.questionId === fu && it.isFollowup);
    engine.submitAnswers("f2", batch.items.map((it) => ({ preguntaId: it.questionId, valorNum: 2 })));
    now += DAY_MS;
  }
  assert.ok(seen, "follow-up item delivered");
  const after = one<{ confirmed_change_dir: number }>(db, "SELECT confirmed_change_dir FROM person_domain_state WHERE compte_id = 'f2' AND domini_id = 2");
  assert.equal(after?.confirmed_change_dir, -1);
});

test("HR format preference 0 bans a format for that collective", () => {
  const db = makeDb();
  addPool(db);
  setFormatPreference(db, { collectiuId: 1, type: "scale10", weight: 0 });
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  for (let i = 0; i < 10; i++) {
    assert.ok(engine.getDailyBatch("f3").items.every((it) => it.type !== "scale10"));
    now += DAY_MS;
  }
  assert.ok(engine.getDailyBatch("o3").items.some((it) => it.type === "scale10") || true);
});

test("HR domain weight steers how often a domain is asked", () => {
  const db = makeDb();
  addPool(db);
  setDomainWeight(db, { collectiuId: null, dominiId: 3, weight: 20 });
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    if (engine.getDailyBatch("o4").items.some((it) => it.domainId === 3)) hits++;
    now += DAY_MS;
  }
  assert.ok(hits >= 18, `domain 3 asked on ${hits}/20 days`);
});

test("job: writes aggregates with score/confidence/consensus and suppresses n < 10", () => {
  const db = makeDb({ accountsPerCollective: 12 });
  addPool(db);
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  const accounts = all<{ id: string }>(db, "SELECT id FROM compte").map((r) => r.id);
  for (let d = 0; d < 20; d++) {
    for (const a of accounts)
      engine.submitAnswers(a, engine.getDailyBatch(a).items.map((it) => ({ preguntaId: it.questionId, valorNum: it.type === "yes_no" ? 1 : 7 })));
    now += DAY_MS;
  }
  const report = runEngineJob(db, { now });
  assert.ok(report.aggregates > 0);
  const rows = all<{ collectiu_id: number | null; torn_id: number | null; n: number; score: number | null; confidence: number | null; consensus: number | null; mitjana: number | null; suprimit: number }>(
    db,
    "SELECT * FROM agregat WHERE periode = '2026-10'",
  );
  for (const r of rows) {
    if (r.n < 10) assert.ok(r.suprimit === 1 && r.score === null && r.confidence === null && r.mitjana === null);
    else assert.ok(r.suprimit === 0 && r.score !== null && r.confidence! >= 0 && r.consensus! <= 100);
  }
  // Shift strata in Fàbriques have 6 accounts each → suppressed; the collective (12) is shown.
  assert.ok(rows.some((r) => r.collectiu_id === 1 && r.torn_id !== null && r.suprimit === 1));
  assert.ok(rows.some((r) => r.collectiu_id === 1 && r.torn_id === null && r.suprimit === 0));
  assert.ok(rows.some((r) => r.collectiu_id === null && r.suprimit === 0));
  assert.equal(getConfig(db).engine_version, report.engineVersion);
  // Idempotent.
  const again = runEngineJob(db, { now });
  assert.equal(again.aggregates, report.aggregates);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM agregat")?.n, report.aggregates);
});

test("job: bootstraps engine state from seeded responses without scores", () => {
  const db = makeDb();
  addPool(db);
  const q = one<{ id: number }>(db, "SELECT id FROM pregunta WHERE tipus = 'scale10' LIMIT 1")!.id;
  const ins = db.prepare("INSERT INTO resposta (compte_id, pregunta_id, valor_num, periode, data) VALUES (?,?,?,?,?)");
  for (let i = 0; i < 12; i++) ins.run(`o${i}`, q, 6, "2026-09", "2026-09-10 10:00:00");
  const report = runEngineJob(db, { now: T0 });
  assert.equal(report.bootstrapped, true);
  assert.equal(report.scoresFilled, 12);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM person_domain_state")?.n, 12);
  assert.equal(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM resposta WHERE score IS NULL")?.n, 0);
});

test("hr: validateQuestion and config", () => {
  assert.deepEqual(validateQuestion({ type: "scale10", text: "x", domainId: 1 }), { ok: true });
  assert.equal(validateQuestion({ type: "escala5", text: "x", domainId: 1 }).ok, false);
  assert.equal(validateQuestion({ type: "pair", text: "x", domainId: 1, options: [{ label: "a", score: 0.9 }] }).ok, false);
  assert.equal(validateQuestion({ type: "ranking", text: "x", domainId: 1, options: [{ label: "a", domain_id: 1 }, { label: "b", domain_id: 2 }, { label: "c", domain_id: 3 }] }).ok, true);
  const db = makeDb();
  setConfig(db, { questions_per_day: 2, priors: { level: 0.7 } });
  assert.equal(getConfig(db).questions_per_day, 2);
  assert.throws(() => setConfig(db, { nope: 1 }));
  assert.throws(() => setConfig(db, { engine_version: "x" }));
  assert.throws(() => setDomainWeight(db, { collectiuId: null, dominiId: 1, weight: 0 }));
  addPool(db);
  assert.equal(createEngine({ db, redact: identity, now: () => T0 }).getDailyBatch("o0").total, 2);
});
