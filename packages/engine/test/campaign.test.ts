// Campaign queries: a one-off extra set, kept apart from the daily batch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, one, run } from "../src/db.ts";
import { selectBatch } from "../src/batch.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createRng } from "../src/rng.ts";
import { createEngine } from "../src/engine.ts";
import type { QuestionDef } from "../src/normalize.ts";
import { addPool, addQuestion, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

const PAIR = [{ label: "x", score: 0 }, { label: "y", score: 1 }];

/** Publishes (or not) a query with the given delivery and one approved question per type. */
function query(db: ReturnType<typeof makeDb>, delivery: "daily" | "campaign", types: string[], opts: { estat?: string; collectiu?: number | null } = {}) {
  run(db, "INSERT INTO necessitat (text_nl, titol, intro, collectiu_id, delivery, question_count, estat) VALUES ('q', 'Title', 'Intro', ?, ?, ?, ?)", opts.collectiu ?? null, delivery, types.length, opts.estat ?? "publicada");
  const nid = one<{ id: number }>(db, "SELECT MAX(id) AS id FROM necessitat")!.id;
  const qids = types.map((t, i) => addQuestion(db, { domain: 6, type: t, facet: `c${nid}${i}`, needId: nid, priority: 10, options: t === "pair" ? PAIR : undefined }));
  return { nid, qids };
}

const value = (type: string) => (type === "yes_no" ? { valorNum: 1 } : type === "pair" ? { valorNum: 1 } : type === "open" ? { valorNum: null, comentari: "text" } : { valorNum: 4 });

test("selectBatch never picks a campaign question, even a published need one", () => {
  const mk = (id: number, campaign: boolean, needId: number | null): QuestionDef => ({
    id, domainId: 1 + (id % 6), collectiuId: null, type: "scale5", text: `q${id}`, facet: `f${id}`, polarity: 1, options: null,
    isFollowup: false, needId, priority: needId ? 10 : 0, campaign,
  });
  const questions = [mk(1, true, 7), mk(2, true, 7), mk(3, false, null), mk(4, false, null), mk(5, false, null), mk(6, false, null)];
  const picks = selectBatch({
    cfg: DEFAULT_CONFIG, rng: createRng("t"), day: "2026-10-01", questions, lastSeen: new Map(), answered: new Set(), dueFollowups: [],
    domains: [1, 2, 3, 4, 5, 6].map((domainId) => ({ domainId, weight: 1, probeBoost: 1 }) as never),
    formatPref: () => 1, formatStats: () => ({ alpha: 1, beta: 1 }),
  });
  assert.ok(picks.length > 0);
  assert.ok(picks.every((p) => !p.question.campaign));
});

test("campaign questions are never in the daily batch, on any day, for any account", () => {
  const db = makeDb();
  addPool(db);
  const { qids } = query(db, "campaign", ["scale5", "yes_no", "pair", "open"]);
  let clock = T0;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  for (let d = 0; d < 10; d++) {
    clock = T0 + d * DAY_MS;
    for (const id of ["f0", "f1", "o0", "o1"]) {
      const b = engine.getDailyBatch(id);
      assert.equal(b.total, 3);
      assert.ok(b.items.every((i) => !qids.includes(i.questionId)), `${id} day ${d}`);
    }
  }
});

test("a daily query still joins the daily set as before", () => {
  const db = makeDb();
  addPool(db);
  const { qids } = query(db, "daily", ["scale5"]);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const b = engine.getDailyBatch("f0");
  assert.ok(b.items.some((i) => i.questionId === qids[0]));
  assert.equal(engine.getCampaign("f0"), null);
});

test("campaign set: all questions, mixed types, returned until answered, then gone", () => {
  const db = makeDb();
  addPool(db);
  const { nid, qids } = query(db, "campaign", ["scale5", "yes_no", "pair", "open"]);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  const c = engine.getCampaign("f0");
  assert.ok(c);
  assert.equal(c.needId, nid);
  assert.equal(c.title, "Title");
  assert.deepEqual(c.items.map((i) => i.questionId), qids);
  assert.deepEqual(c.items.map((i) => i.type), ["scale5", "yes_no", "pair", "open"]);
  assert.deepEqual(engine.getCampaign("f0")!.items.length, 4, "stays available until answered");

  // Answer them while the daily batch is untouched.
  const daily = engine.getDailyBatch("f0");
  const first = engine.submitAnswers("f0", c.items.slice(0, 2).map((i) => ({ preguntaId: i.questionId, ...value(i.type) })));
  assert.deepEqual(first.accepted, qids.slice(0, 2));
  assert.equal(first.remainingToday, 3);
  assert.equal(first.remainingCampaign, 2);
  assert.equal(engine.getDailyBatch("f0").answered, daily.answered);
  assert.deepEqual(engine.getCampaign("f0")!.items.map((i) => i.questionId), qids.slice(2));

  const rest = engine.submitAnswers("f0", c.items.slice(2).map((i) => ({ preguntaId: i.questionId, ...value(i.type) })));
  assert.deepEqual(rest.accepted, qids.slice(2));
  assert.equal(rest.remainingCampaign, 0);
  assert.equal(engine.getCampaign("f0"), null);
  assert.equal(all(db, "SELECT 1 FROM resposta WHERE compte_id = 'f0'").length, 4);
  // Other accounts are unaffected.
  assert.equal(engine.getCampaign("f1")!.items.length, 4);
});

test("a campaign question can be answered only once", () => {
  const db = makeDb();
  addPool(db);
  const { qids } = query(db, "campaign", ["scale5", "yes_no"]);
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  assert.deepEqual(engine.submitAnswers("f0", [{ preguntaId: qids[0]!, valorNum: 3 }]).accepted, [qids[0]]);
  const again = engine.submitAnswers("f0", [{ preguntaId: qids[0]!, valorNum: 5 }, { preguntaId: qids[1]!, valorNum: 1 }, { preguntaId: qids[1]!, valorNum: 0 }]);
  assert.deepEqual(again.accepted, [qids[1]]);
  assert.deepEqual(again.rejected.map((r) => r.reason), ["already_answered", "already_answered"]);
  assert.equal(all(db, "SELECT 1 FROM resposta WHERE compte_id = 'f0'").length, 2);
});

test("campaign reaches only its collective, only while published", () => {
  const db = makeDb();
  addPool(db);
  const { nid, qids } = query(db, "campaign", ["scale5", "yes_no"], { collectiu: 1 });
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  assert.ok(engine.getCampaign("f0"), "target collective");
  assert.equal(engine.getCampaign("o0"), null, "other collective");
  assert.deepEqual(engine.submitAnswers("o0", [{ preguntaId: qids[0]!, valorNum: 3 }]).rejected.map((r) => r.reason), ["not_in_todays_batch"]);

  run(db, "UPDATE necessitat SET estat = 'tancada' WHERE id = ?", nid);
  assert.equal(engine.getCampaign("f0"), null, "closed by HR");
  assert.deepEqual(engine.submitAnswers("f0", [{ preguntaId: qids[0]!, valorNum: 3 }]).rejected.map((r) => r.reason), ["not_in_todays_batch"]);

  const draft = query(db, "campaign", ["scale5"], { estat: "oberta" });
  assert.equal(engine.getCampaign("o0"), null, "not published yet");
  void draft;
});

test("a database without the delivery column still works (no campaign)", () => {
  const db = makeDb();
  addPool(db);
  db.exec("ALTER TABLE necessitat DROP COLUMN delivery");
  const engine = createEngine({ db, redact: identity, now: () => T0 });
  assert.equal(engine.getDailyBatch("f0").total, 3);
  assert.equal(engine.getCampaign("f0"), null);
});
