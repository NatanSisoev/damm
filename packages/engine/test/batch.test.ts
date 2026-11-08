// Daily batch rules: exactly the daily cap, one answer type per day, no free text, needs inside the cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, run } from "../src/db.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createEngine } from "../src/engine.ts";
import { addQuestion, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

const CAP = DEFAULT_CONFIG.questionsPerDay;
const ids = ["f0", "f1", "f2", "f3", "o0", "o1"];

/** Mixed pool: every domain has items of several types, plus open items that must never be served. */
function mixedPool(db: ReturnType<typeof makeDb>) {
  const yn = [{ label: "x", score: 0 }, { label: "y", score: 1 }];
  for (let d = 1; d <= 6; d++) {
    addQuestion(db, { domain: d, type: "scale5", facet: `a${d}` });
    addQuestion(db, { domain: d, type: "scale5", facet: `b${d}` });
    addQuestion(db, { domain: d, type: "scale10", facet: `c${d}` });
    addQuestion(db, { domain: d, type: "yes_no", facet: `d${d}` });
    addQuestion(db, { domain: d, type: "pair", facet: `e${d}`, options: yn });
    addQuestion(db, { domain: d, type: "open", facet: `o${d}` });
  }
}

function needWith(db: ReturnType<typeof makeDb>, types: string[], estat = "publicada") {
  run(db, "INSERT INTO necessitat (text_nl, collectiu_id, estat) VALUES ('need', NULL, ?)", estat);
  const id = (all<{ id: number }>(db, "SELECT MAX(id) AS id FROM necessitat")[0]!).id;
  for (const t of types)
    addQuestion(db, { domain: 6, type: t, facet: `n${t}`, needId: id, priority: 10, options: t === "pair" ? [{ label: "x", score: 0 }, { label: "y", score: 1 }] : undefined });
  return id;
}

test("every day, every account: exactly the cap, one answer type, no free text, no repeats", () => {
  const db = makeDb();
  mixedPool(db);
  let clock = T0;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  for (let d = 0; d < 30; d++) {
    clock = T0 + d * DAY_MS;
    for (const id of ids) {
      const b = engine.getDailyBatch(id);
      assert.equal(b.total, CAP, `${id} day ${d}`);
      assert.equal(new Set(b.items.map((i) => i.type)).size, 1, `${id} day ${d} mixes types`);
      assert.ok(b.items.every((i) => i.type !== "open"), "open item in batch");
      assert.equal(new Set(b.items.map((i) => i.questionId)).size, CAP);
    }
  }
});

test("a published need sits inside the cap and sets the day's type", () => {
  const db = makeDb();
  mixedPool(db);
  needWith(db, ["yes_no", "yes_no", "yes_no"]);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const b = engine.getDailyBatch("f0");
  assert.equal(b.total, CAP);
  assert.ok(b.items.every((i) => i.type === "yes_no"));
  const reasons = all<{ reason: string }>(db, "SELECT reason FROM assignment WHERE compte_id = 'f0'").map((r) => r.reason);
  assert.equal(reasons.filter((r) => r === "need").length, DEFAULT_CONFIG.maxNeedsPerDay);
});

test("a need published after the batch exists is not added on top of the cap", () => {
  const db = makeDb();
  mixedPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const first = engine.getDailyBatch("f0");
  needWith(db, ["scale5", "scale5"]);
  const again = engine.getDailyBatch("f0");
  assert.equal(again.total, CAP);
  assert.deepEqual(again.items.map((i) => i.questionId), first.items.map((i) => i.questionId));
  // The next day the need takes priority inside the cap.
  const next = createEngine({ db, redact: identity, now: () => T0 + DAY_MS }).getDailyBatch("f0");
  assert.equal(next.total, CAP);
  assert.equal(all(db, "SELECT 1 FROM assignment a JOIN pregunta p ON p.id = a.pregunta_id WHERE a.compte_id='f0' AND p.necessitat_id IS NOT NULL AND a.day = '2026-10-02'").length, 1);
});

test("open need questions are skipped; the batch falls back to monitoring", () => {
  const db = makeDb();
  mixedPool(db);
  needWith(db, ["open"]);
  const b = createEngine({ db, redact: identity, now: () => T0 }).getDailyBatch("f0");
  assert.equal(b.total, CAP);
  assert.ok(b.items.every((i) => i.type !== "open"));
});

test("when the pool has fewer same-type items than the cap, the batch is shorter, never mixed", () => {
  const db = makeDb();
  addQuestion(db, { domain: 1, type: "scale5", facet: "a" });
  addQuestion(db, { domain: 2, type: "scale5", facet: "b" });
  addQuestion(db, { domain: 3, type: "yes_no", facet: "c" });
  const b = createEngine({ db, redact: identity, now: () => T0 }).getDailyBatch("f0");
  assert.equal(new Set(b.items.map((i) => i.type)).size, 1);
  assert.equal(b.total, 2);
  assert.equal(b.items[0]!.type, "scale5");
});

test("deterministic: same account and day give the same batch", () => {
  const a = makeDb();
  const b = makeDb();
  mixedPool(a);
  mixedPool(b);
  const ea = createEngine({ db: a, redact: identity, now: () => T0 }).getDailyBatch("f1");
  const eb = createEngine({ db: b, redact: identity, now: () => T0 }).getDailyBatch("f1");
  assert.deepEqual(ea.items.map((i) => i.questionId), eb.items.map((i) => i.questionId));
});

test("an optional comment on a non-text question is stored (redacted) and never required", () => {
  const db = makeDb();
  mixedPool(db);
  const engine = createEngine({ db, redact: (s) => s.replace(/secret/g, "***"), now: () => T0 });
  const items = engine.getDailyBatch("f0").items;
  const val = (t: string) => (t === "yes_no" || t === "pair" ? 1 : 3);
  const r1 = engine.submitAnswers("f0", [{ preguntaId: items[0]!.questionId, valorNum: val(items[0]!.type) }]);
  assert.deepEqual(r1.accepted, [items[0]!.questionId]);
  const r2 = engine.submitAnswers("f0", [{ preguntaId: items[1]!.questionId, valorNum: val(items[1]!.type), comentari: "my secret idea" }]);
  assert.equal(r2.accepted.length, 1);
  const rows = all<{ comentari: string | null }>(db, "SELECT comentari FROM resposta ORDER BY id");
  assert.deepEqual(rows.map((r) => r.comentari), [null, "my *** idea"]);
});
