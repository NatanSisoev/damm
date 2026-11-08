import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { listProbes, startProbe, stopProbe, ProbeError } from "../src/hr.ts";
import { activeProbeBoosts } from "../src/probe.ts";
import { domainPriority, selectBatch, PROBE_OPEN_PREF, type DomainSignal } from "../src/batch.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createRng } from "../src/rng.ts";
import { all, run } from "../src/db.ts";
import type { QuestionDef } from "../src/normalize.ts";
import { addPool, addQuestion, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

type Db = ReturnType<typeof makeDb>;

/** Share of daily batches, over `days` days from `from`, in which `domain` was asked, for the given accounts. */
function share(db: Db, ids: string[], domain: number, from: number, days: number): number {
  let clock = from;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  let hits = 0;
  let total = 0;
  for (let d = 0; d < days; d++) {
    clock = from + d * DAY_MS;
    for (const id of ids) {
      const b = engine.getDailyBatch(id);
      total++;
      if (b.items.some((i) => i.domainId === domain)) hits++;
    }
  }
  return hits / total;
}
const fab = (db: Db, torn: number | null) =>
  all<{ id: string }>(db, "SELECT id FROM compte WHERE collectiu_id = 1 AND (? IS NULL OR torn_id = ?)", torn, torn).map((r) => r.id);
const office = (db: Db) => all<{ id: string }>(db, "SELECT id FROM compte WHERE collectiu_id = 2").map((r) => r.id);

test("boost applies only inside the segment and the window", () => {
  const db = makeDb();
  addPool(db);
  const start = T0 + 40 * DAY_MS;
  startProbe(db, { collectiuId: 1, tornId: 1, dominiId: 1, boost: 4, days: 30, now: start });

  const inside = share(db, fab(db, 1), 1, start + DAY_MS, 25);
  const otherShift = share(db, fab(db, 2), 1, start + DAY_MS, 25);
  const otherCollective = share(db, office(db), 1, start + DAY_MS, 25);
  const before = share(db, fab(db, 1), 1, T0, 25);
  const after = share(db, fab(db, 1), 1, start + 60 * DAY_MS, 25);

  assert.ok(inside > 0.75, `inside ${inside}`);
  for (const [name, v] of Object.entries({ otherShift, otherCollective, before, after })) {
    assert.ok(v < inside - 0.15, `${name} ${v} should be well below inside ${inside}`);
    assert.ok(v < 0.65, `${name} ${v} stays at the normal rate`);
  }
});

test("expiry and stop end the boost", () => {
  const db = makeDb();
  const p = startProbe(db, { collectiuId: 1, dominiId: 2, days: 7, now: T0 });
  assert.equal(p.status, "active");
  assert.equal(p.daysLeft, 7);
  assert.equal(activeProbeBoosts(db, 1, 1, T0 + 6 * DAY_MS).get(2), 2);
  assert.equal(activeProbeBoosts(db, 1, 1, T0 + 7 * DAY_MS).size, 0);
  assert.equal(activeProbeBoosts(db, 1, 1, T0 - DAY_MS).size, 0);
  assert.equal(listProbes(db, { now: T0 + 8 * DAY_MS })[0]!.status, "expired");

  const q = startProbe(db, { collectiuId: 2, dominiId: 3, days: 30, now: T0 });
  assert.equal(activeProbeBoosts(db, 2, null, T0 + DAY_MS).get(3), 2);
  assert.equal(stopProbe(db, q.id, T0 + 2 * DAY_MS).status, "stopped");
  assert.equal(activeProbeBoosts(db, 2, null, T0 + 3 * DAY_MS).size, 0);
  const first = stopProbe(db, q.id, T0 + 5 * DAY_MS).stoppedAt;
  assert.equal(stopProbe(db, q.id, T0 + 9 * DAY_MS).stoppedAt, first, "stopping twice changes nothing");
  assert.deepEqual(listProbes(db, { collectiuId: 2, status: "active", now: T0 + 3 * DAY_MS }), []);
});

test("segments under the minimum group size and bad input are refused", () => {
  const db = makeDb();
  run(db, "INSERT INTO collectiu (id, nom) VALUES (3, 'Tiny')");
  for (let i = 0; i < 9; i++) run(db, "INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (3, 1, NULL)");
  assert.throws(() => startProbe(db, { collectiuId: 3, dominiId: 1, now: T0 }), /minimum group size/);
  run(db, "INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (3, 1, NULL)");
  assert.ok(startProbe(db, { collectiuId: 3, dominiId: 1, now: T0 }));

  // The collective is big enough, one shift of it is not.
  run(db, "INSERT INTO collectiu (id, nom) VALUES (4, 'Split')");
  for (let i = 0; i < 12; i++) run(db, "INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (4, 1, ?)", i < 3 ? 2 : 1);
  assert.throws(() => startProbe(db, { collectiuId: 4, tornId: 2, dominiId: 1, now: T0 }), ProbeError);
  assert.ok(startProbe(db, { collectiuId: 4, dominiId: 1, now: T0 }));

  for (const bad of [{ boost: 1 }, { boost: 11 }, { boost: Number.NaN }, { days: 0 }, { days: 91 }, { dominiId: 99 }, { collectiuId: 99 }, { tornId: 99 }, { senyalId: 99 }])
    assert.throws(() => startProbe(db, { collectiuId: 1, dominiId: 1, now: T0, ...bad }), ProbeError, JSON.stringify(bad));
  startProbe(db, { collectiuId: 1, dominiId: 1, now: T0 });
  assert.throws(() => startProbe(db, { collectiuId: 1, dominiId: 1, now: T0 + DAY_MS }), /already active/);
  assert.ok(startProbe(db, { collectiuId: 1, dominiId: 1, now: T0 + 15 * DAY_MS }), "allowed again once the first expired");
});

test("daily cap, one item per domain, follow-up first and facet coverage hold during a probe", () => {
  const db = makeDb();
  addPool(db);
  for (let i = 0; i < 20; i++) addQuestion(db, { domain: 1, type: "scale10", facet: `big${i % 10}` });
  startProbe(db, { collectiuId: 1, dominiId: 1, boost: 10, days: 60, now: T0 });
  let clock = T0;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  const cap = DEFAULT_CONFIG.questionsPerDay;
  const probedFacets: string[] = [];
  const facetOf = new Map(all<{ id: number; facet: string }>(db, "SELECT id, facet FROM pregunta").map((r) => [r.id, r.facet]));
  for (let d = 0; d < 28; d++) {
    clock = T0 + d * DAY_MS;
    for (const id of fab(db, null)) {
      const b = engine.getDailyBatch(id);
      assert.ok(b.total <= cap, `cap ${b.total}`);
      assert.equal(new Set(b.items.map((i) => i.domainId)).size, b.items.length, "one item per domain");
      if (id === "f0") for (const i of b.items) if (i.domainId === 1) probedFacets.push(facetOf.get(i.questionId)!);
    }
  }
  // Facet coverage widens: the first ten probed asks cover ten different facets (the domain has twelve).
  // A day holds one answer type, so only items of the day's type rotate: at least six distinct facets.
  assert.ok(new Set(probedFacets.slice(0, 10)).size >= 6, probedFacets.join(","));

  // A due follow-up still comes first, probe or not.
  run(
    db,
    `INSERT INTO person_domain_state (compte_id, domini_id, level, variance, n, last_at, pending_followup_level, followup_due)
     VALUES ('f1', 3, 0.5, 0.05, 3, '2026-10-01 08:00:00', 0.7, '2026-09-01')`,
  );
  addQuestion(db, { domain: 3, type: "scale5", facet: "fu", followup: true });
  clock = T0 + 40 * DAY_MS;
  const items = engine.getDailyBatch("f1").items;
  assert.equal(items[0]!.isFollowup, true);
  assert.equal(items[0]!.domainId, 3);
  assert.ok(items.length <= cap);
});

test("pure scheduler: priority multiplies by the boost, and open prompts are never batch items", () => {
  const cfg = DEFAULT_CONFIG;
  const d: DomainSignal = { domainId: 1, infoGain: 0.5, outlierShare: 0, weight: 1.5 };
  assert.equal(domainPriority({ ...d, probeBoost: 3 }, 1, cfg), 3 * domainPriority(d, 1, cfg));
  assert.equal(domainPriority({ ...d, probeBoost: 1 }, 1, cfg), domainPriority(d, 1, cfg));

  const mk = (id: number, type: "scale10" | "open"): QuestionDef => ({
    id, domainId: 1, collectiuId: null, type, text: "q", facet: "shift", polarity: 1, options: null, isFollowup: false, needId: null, priority: 0, campaign: false,
  });
  const questions = [mk(1, "scale10"), mk(2, "open")];
  const openShare = (probeBoost: number) => {
    let open = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const [pick] = selectBatch({
        cfg: { ...cfg, questionsPerDay: 1 },
        rng: createRng(`s${i}`),
        day: "2026-10-01",
        questions,
        lastSeen: new Map(),
        answered: new Set(),
        dueFollowups: [],
        domains: [{ ...d, probeBoost }],
        formatPref: () => 1,
        formatStats: () => ({ alpha: 1, beta: 1 }),
      });
      if (pick!.question.type === "open") open++;
    }
    return open / N;
  };
  const normal = openShare(1);
  const probed = openShare(3);
  // Free text is an optional comment on other questions, never a batch item, probe or not.
  assert.equal(normal, 0, `normal ${normal}`);
  assert.equal(probed, 0, `probed ${probed} (pref ${PROBE_OPEN_PREF})`);
});

test("progress: extra answers and confidence before vs now, aggregate only", () => {
  const db = makeDb();
  addPool(db);
  let clock = T0;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  const answerAll = (ids: string[]) => {
    for (const id of ids) {
      const todo = engine.getDailyBatch(id).items.filter((i) => !i.answered);
      engine.submitAnswers(id, todo.map((i) => ({ preguntaId: i.questionId, valorNum: i.type === "yes_no" ? 1 : 7, answerMs: 3000 })));
    }
  };
  const ids = fab(db, null);
  for (let d = 0; d < 8; d++) {
    clock = T0 + d * DAY_MS;
    answerAll(ids);
  }
  clock = T0 + 8 * DAY_MS;
  runEngineJob(db, { now: clock });
  const p = startProbe(db, { collectiuId: 1, dominiId: 1, boost: 6, days: 14, now: clock });
  assert.equal(p.progress, null, "no progress before the job has run");
  for (let d = 8; d < 16; d++) {
    clock = T0 + d * DAY_MS;
    answerAll(ids);
  }
  clock = T0 + 16 * DAY_MS;
  runEngineJob(db, { now: clock });
  const [v] = listProbes(db, { now: clock });
  const pr = v!.progress!;
  assert.equal(pr.suppressed, false);
  assert.ok(pr.people! >= 10);
  assert.ok(pr.answers! > 0 && pr.answersBefore! > 0);
  assert.equal(pr.extraAnswers, pr.answers! - pr.answersBefore!);
  assert.equal(typeof pr.confidenceBefore, "number", "baseline taken from the aggregate at start");
  assert.equal(typeof pr.confidenceNow, "number");
  assert.ok(!/compte|account|username/i.test(JSON.stringify(v)));
});

test("progress is suppressed under the minimum group size", () => {
  const db = makeDb();
  addPool(db);
  let clock = T0;
  const engine = createEngine({ db, redact: identity, now: () => clock });
  startProbe(db, { collectiuId: 2, dominiId: 1, boost: 10, days: 14, now: T0 });
  for (let d = 0; d < 10; d++) {
    clock = T0 + d * DAY_MS;
    for (const id of ["o0", "o1", "o2"]) {
      const todo = engine.getDailyBatch(id).items;
      engine.submitAnswers(id, todo.map((i) => ({ preguntaId: i.questionId, valorNum: i.type === "yes_no" ? 1 : 7 })));
    }
  }
  clock = T0 + 10 * DAY_MS;
  runEngineJob(db, { now: clock });
  const pr = listProbes(db, { now: clock })[0]!.progress!;
  assert.equal(pr.suppressed, true);
  for (const k of ["answers", "answersBefore", "extraAnswers", "people", "confidenceBefore", "confidenceNow", "scoreNow"] as const) assert.equal(pr[k], null, k);
});
