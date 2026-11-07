import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { listPool, setQuestionActive } from "../src/pool.ts";
import { run } from "../src/db.ts";
import { addPool, addQuestion, identity, makeDb, T0 } from "./helpers.ts";

test("pool: delivery counts, answer rate, state and reason", () => {
  const db = makeDb();
  addPool(db);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const batch = engine.getDailyBatch("f0");
  const first = batch.items[0]!;
  engine.submitAnswers("f0", [{ preguntaId: first.questionId, valorNum: first.type === "yes_no" ? 1 : 7, answerMs: 4000 }]);
  engine.getDailyBatch("f1");

  const pool = listPool(db, { now: T0 });
  assert.equal(pool.questions.length, 18);
  assert.equal(pool.summary.counts.live, 18);
  assert.equal(pool.summary.accounts, 24);
  assert.equal(pool.summary.asked, pool.questions.reduce((s, q) => s + q.asked, 0));
  assert.equal(pool.summary.asked, 6); // two accounts x 3 questions

  const q = pool.questions.find((x) => x.id === first.questionId)!;
  assert.ok(q.asked >= 1);
  assert.equal(q.responses, 1);
  assert.equal(q.answeredAssigned, 1);
  assert.equal(q.reachedAccounts, 1);
  assert.equal(q.answerRate, 1 / q.asked);
  assert.equal(q.avgScore, null, "one answer is under the minimum group size");
  assert.equal(q.nextBatchDay, "2026-10-02");
  assert.equal(q.byCollective[0]!.collective, "Fàbriques");
  assert.equal(q.lastAskedDay, "2026-10-01");
});

test("pool: states for draft, retired, unpublished and closed need questions", () => {
  const db = makeDb();
  const mon = addQuestion(db, { domain: 1, type: "scale10", facet: "a" });
  run(db, "INSERT INTO necessitat (id, text_nl, estat) VALUES (1, 'need', 'oberta'), (2, 'closed', 'tancada')");
  const unpub = addQuestion(db, { domain: 2, type: "scale10", facet: "b", needId: 1 });
  const closed = addQuestion(db, { domain: 3, type: "scale10", facet: "c", needId: 2 });
  const fu = addQuestion(db, { domain: 4, type: "scale10", facet: "d", followup: true });
  run(db, "INSERT INTO pregunta (domini_id, text, tipus, estat) VALUES (5, 'draft', 'scale10', 'draft')");
  const by = (id: number) => listPool(db, { now: T0 }).questions.find((q) => q.id === id)!;

  assert.equal(by(mon).reason, "live");
  assert.equal(by(unpub).reason, "need_unpublished");
  assert.equal(by(closed).reason, "need_closed");
  assert.equal(by(fu).reason, "followup_only");
  assert.equal(by(unpub).nextBatchDay, null);
  assert.equal(listPool(db, { now: T0 }).questions.at(-1)!.reason, "draft");

  run(db, "UPDATE necessitat SET estat = 'publicada' WHERE id = 1");
  assert.equal(by(unpub).reason, "live");
  assert.equal(by(unpub).pendingAccounts, 24);
});

test("pool: retire and reactivate; a never-approved discarded draft cannot be reactivated", () => {
  const db = makeDb();
  const id = addQuestion(db, { domain: 1, type: "scale10", facet: "a" });
  const draft = Number(db.prepare("INSERT INTO pregunta (domini_id, text, tipus, estat) VALUES (1, 'x', 'scale10', 'retirada')").run().lastInsertRowid);
  run(db, "UPDATE pregunta SET aprovada_el = datetime('now') WHERE id = ?", id); // approved earlier
  assert.deepEqual(setQuestionActive(db, id, false, "hr"), { ok: true });
  assert.deepEqual(setQuestionActive(db, id, false, "hr"), { ok: false, error: "already" });
  assert.equal(listPool(db, { now: T0 }).questions.find((q) => q.id === id)!.reason, "retired");
  assert.deepEqual(setQuestionActive(db, id, true, "hr"), { ok: true });
  assert.equal(listPool(db, { now: T0 }).questions.find((q) => q.id === id)!.approvedBy, "hr");
  assert.deepEqual(setQuestionActive(db, draft, true, "hr"), { ok: false, error: "not_approved_before" });
  assert.deepEqual(setQuestionActive(db, 9999, true, "hr"), { ok: false, error: "not_found" });
});

test("pool detail: weekly series, distribution and suppression", async () => {
  const { getPoolQuestion } = await import("../src/pool.ts");
  const db = makeDb({ accountsPerCollective: 12 });
  const id = addQuestion(db, { domain: 1, type: "scale5", facet: "a" });
  for (let i = 0; i < 12; i++) {
    run(db, "INSERT INTO resposta (compte_id, pregunta_id, valor_num, score, periode, data) VALUES (?,?,?,?,?,?)", `f${i}`, id, (i % 5) + 1, ((i % 5) + 1 - 1) / 4, "2026-10", "2026-10-01 09:00:00");
  }
  const d = getPoolQuestion(db, id, { now: T0 })!;
  assert.equal(d.question.responses, 12);
  assert.equal(d.weekly.length, 1);
  assert.equal(d.weekly[0]!.week, "2026-09-28"); // Monday of the week of 2026-10-01
  assert.equal(d.distribution!.bars.reduce((s, b) => s + b.count, 0), 12);
  assert.ok(d.segments.every((s) => s.suppressed === (s.responses < 10)));
  assert.equal(getPoolQuestion(db, 9999, { now: T0 }), null);
  const small = addQuestion(db, { domain: 1, type: "scale5", facet: "b" });
  run(db, "INSERT INTO resposta (compte_id, pregunta_id, valor_num, score, periode) VALUES ('f0', ?, 3, 0.5, '2026-10')", small);
  const ds = getPoolQuestion(db, small, { now: T0 })!;
  assert.equal(ds.distribution, null);
  assert.equal(ds.periods[0]!.avgScore, null);
});
