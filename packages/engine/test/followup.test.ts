// Conditional follow-up: a low scale answer or a "no" returns the linked open question, outside the cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, one, run } from "../src/db.ts";
import { createEngine } from "../src/engine.ts";
import { listPool } from "../src/pool.ts";
import { addPool, addQuestion, T0, makeDb } from "./helpers.ts";

function setup() {
  const db = makeDb();
  addPool(db);
  run(db, "INSERT INTO necessitat (text_nl, titol, intro, delivery, question_count, estat) VALUES ('q', 'T', 'Intro intro', 'campaign', 2, 'publicada')");
  const nid = one<{ id: number }>(db, "SELECT MAX(id) AS id FROM necessitat")!.id;
  const scale = addQuestion(db, { domain: 6, type: "scale5", facet: "fa", needId: nid, priority: 10 });
  const yn = addQuestion(db, { domain: 6, type: "yes_no", facet: "fb", needId: nid, priority: 10 });
  const child = (parent: number, when: string) => {
    const r = run(db, "INSERT INTO pregunta (domini_id, text, tipus, facet, estat, followup_of, followup_when) VALUES (6, 'Què ho faria millor?', 'open', 'w', 'aprovada', ?, ?)", parent, when);
    return Number(r.lastInsertRowid);
  };
  return { db, scale, yn, cs: child(scale, "low"), cy: child(yn, "no") };
}
const redact = (s: string) => s.replace(/\d{9}/g, "[tel]");
const engineOf = (db: ReturnType<typeof makeDb>) => createEngine({ db, redact, now: () => T0 });

test("a scale answer of 2 returns the follow-up, 3 does not", () => {
  const { db, scale, cs } = setup();
  assert.deepEqual(engineOf(db).submitAnswers("f0", [{ preguntaId: scale, valorNum: 3 }]).followups, []);
  const db2 = setup();
  const r = engineOf(db2.db).submitAnswers("f1", [{ preguntaId: db2.scale, valorNum: 2 }]);
  assert.deepEqual(r.followups.map((f) => [f.questionId, f.parentId, f.type]), [[db2.cs, db2.scale, "open"]]);
  assert.ok(cs > 0);
});

test("yes_no 'no' triggers, 'yes' does not", () => {
  const a = setup();
  assert.equal(engineOf(a.db).submitAnswers("f0", [{ preguntaId: a.yn, valorNum: 0 }]).followups[0]?.questionId, a.cy);
  const b = setup();
  assert.equal(engineOf(b.db).submitAnswers("f0", [{ preguntaId: b.yn, valorNum: 1 }]).followups.length, 0);
});

test("children are not in the daily batch, the campaign set or the pool list", () => {
  const { db, cs, cy } = setup();
  const e = engineOf(db);
  const c = e.getCampaign("f0")!;
  assert.ok(c.items.every((i) => i.questionId !== cs && i.questionId !== cy));
  assert.ok(e.getDailyBatch("f0").items.every((i) => i.questionId !== cs && i.questionId !== cy));
  assert.ok(listPool(db, { now: T0 }).questions.every((p) => p.id !== cs && p.id !== cy));
});

test("the follow-up can be answered once, only after it triggered; the comment is redacted", () => {
  const { db, scale, cs } = setup();
  const e = engineOf(db);
  const early = e.submitAnswers("f0", [{ preguntaId: cs, valorNum: null, comentari: "x ok" }]);
  assert.equal(early.rejected[0]?.reason, "not_in_todays_batch");
  e.submitAnswers("f0", [{ preguntaId: scale, valorNum: 1 }]);
  const ok = e.submitAnswers("f0", [{ preguntaId: cs, valorNum: null, comentari: "truca al 600123456 sisplau" }]);
  assert.deepEqual(ok.accepted, [cs]);
  assert.deepEqual(ok.followups, []);
  const row = one<{ comentari: string }>(db, "SELECT comentari FROM resposta WHERE pregunta_id = ?", cs)!;
  assert.ok(!row.comentari.includes("600123456"));
  const again = e.submitAnswers("f0", [{ preguntaId: cs, valorNum: null, comentari: "altra vegada" }]);
  assert.equal(again.accepted.length, 0);
  assert.equal(all(db, "SELECT 1 FROM resposta WHERE pregunta_id = ?", cs).length, 1);
});

test("a follow-up does not change the remaining counts", () => {
  const { db, scale } = setup();
  const e = engineOf(db);
  const before = e.getCampaign("f0")!.items.length;
  const r = e.submitAnswers("f0", [{ preguntaId: scale, valorNum: 1 }]);
  assert.equal(r.remainingCampaign, before - 1);
  assert.equal(r.followups.length, 1);
});
