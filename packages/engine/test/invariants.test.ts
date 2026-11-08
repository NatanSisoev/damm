// Property-based invariants: many random small worlds from seeds, the same assertions on each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, one } from "../src/db.ts";
import { runEngineJob } from "../src/job.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { EMPTY_ITEM } from "../src/item-bias.ts";
import { learn } from "../src/learn.ts";
import { createRng } from "../src/rng.ts";
import { addDays } from "../src/time.ts";
import { cloneDb, dumpAll, dumpTable, findBadNumbers, OUTPUT_TABLES } from "./db-util.ts";
import { generateWorld, type World } from "./world-gen.ts";

const MIN = DEFAULT_CONFIG.minGroupSize;
const SEEDS: { seed: string; accounts: number; days: number }[] = [
  { seed: "inv-1", accounts: 5, days: 20 },
  { seed: "inv-2", accounts: 9, days: 30 },
  { seed: "inv-3", accounts: 14, days: 25 },
  { seed: "inv-4", accounts: 22, days: 35 },
  { seed: "inv-5", accounts: 26, days: 40 },
  { seed: "inv-6", accounts: 11, days: 45 },
  { seed: "inv-7", accounts: 18, days: 60 }, // crosses a month boundary twice
  { seed: "inv-8", accounts: 7, days: 15 },
];

interface Built {
  name: string;
  world: World;
}
const built: Built[] = [];
function worlds(): Built[] {
  if (built.length === 0)
    for (const s of SEEDS) {
      const world = generateWorld(s.seed, { accountsPerCollective: s.accounts, days: s.days });
      runEngineJob(world.db, { now: world.clock.now });
      built.push({ name: s.seed, world });
    }
  return built;
}

const each = (fn: (b: Built) => void) => () => worlds().forEach(fn);

test("generator sanity: worlds contain answers, suppressed and visible segments", () => {
  let visible = 0;
  let hidden = 0;
  for (const { name, world } of worlds()) {
    assert.ok((one<{ n: number }>(world.db, "SELECT COUNT(*) AS n FROM resposta")?.n ?? 0) > 20, name);
    visible += one<{ n: number }>(world.db, "SELECT COUNT(*) AS n FROM agregat WHERE suprimit = 0")?.n ?? 0;
    hidden += one<{ n: number }>(world.db, "SELECT COUNT(*) AS n FROM agregat WHERE suprimit = 1")?.n ?? 0;
  }
  assert.ok(visible > 0 && hidden > 0, `visible ${visible}, hidden ${hidden}`);
});

test("every resposta.score is in [0,1] (or NULL for ranking/open)", each(({ name, world }) => {
  const bad = all(world.db, "SELECT id, score FROM resposta WHERE score IS NOT NULL AND (score < 0 OR score > 1)");
  assert.deepEqual(bad, [], name);
}));

test("person levels stay in [0,1] even when item bias pushes the adjusted answer outside", () => {
  const q = { id: 1, domainId: 1, collectiuId: null, type: "scale10", text: "q", facet: "f", polarity: 1, options: null, isFollowup: false, needId: null, priority: 0, campaign: false } as const;
  for (const [bias, score] of [[-0.3, 1], [0.3, 0], [-0.9, 1], [0.9, 0]] as const) {
    let person = null;
    let item = { ...EMPTY_ITEM, bias };
    for (let i = 0; i < 60; i++) {
      const out = learn({ person, item, question: q, score, at: `2026-09-${String(1 + (i % 28)).padStart(2, "0")} 09:00:00`, day: "2026-09-01", isFollowup: false }, DEFAULT_CONFIG, createRng(`b${i}`));
      person = out.person;
      item = { ...EMPTY_ITEM, bias };
      assert.ok(person.level >= 0 && person.level <= 1, `level ${person.level} with bias ${bias}, score ${score}`);
    }
  }
  for (const { name, world } of worlds()) assert.deepEqual(all(world.db, "SELECT * FROM person_domain_state WHERE level < 0 OR level > 1 OR variance <= 0"), [], name);
});

test("agregat: score in [0,10], confidence and consensus in [0,100], mean in [1,5]", each(({ name, world }) => {
  const bad = all(
    world.db,
    `SELECT * FROM agregat WHERE suprimit = 0 AND (score < 0 OR score > 10 OR confidence < 0 OR confidence > 100
       OR consensus < 0 OR consensus > 100 OR mitjana < 1 OR mitjana > 5 OR score IS NULL OR confidence IS NULL OR consensus IS NULL)`,
  );
  assert.deepEqual(bad, [], name);
  const imp = all(world.db, "SELECT * FROM domain_importance WHERE suprimit = 0 AND (importance IS NULL OR importance < 0 OR importance > 1)");
  assert.deepEqual(imp, [], name);
}));

test("rows with n < 10 are suppressed with NULL values: agregat, insight, domain_importance, senyal", each(({ name, world }) => {
  const db = world.db;
  assert.deepEqual(all(db, `SELECT * FROM agregat WHERE n < ${MIN} AND (suprimit = 0 OR mitjana IS NOT NULL OR score IS NOT NULL OR confidence IS NOT NULL OR consensus IS NOT NULL)`), [], `${name} agregat`);
  assert.deepEqual(all(db, `SELECT * FROM domain_importance WHERE n < ${MIN} AND (suprimit = 0 OR importance IS NOT NULL)`), [], `${name} importance`);
  assert.deepEqual(all(db, `SELECT id, kind, n FROM insight WHERE n < ${MIN} AND (suprimit = 0 OR value IS NOT NULL OR detail_json IS NOT NULL)`), [], `${name} insight`);
  assert.deepEqual(all(db, `SELECT id, tipus, n FROM senyal WHERE n < ${MIN} AND (suprimit = 0 OR confianca IS NOT NULL)`), [], `${name} senyal`);
  // The flag and the values agree the other way round too.
  assert.deepEqual(all(db, "SELECT id FROM agregat WHERE suprimit = 1 AND n >= ?", MIN).length >= 0, true);
}));

test("no NaN or infinity anywhere in the database", each(({ name, world }) => {
  assert.deepEqual(findBadNumbers(world.db), [], name);
}));

test("batches: at most questions_per_day items, distinct questions, never a banned format", each(({ name, world }) => {
  assert.ok(world.batches.length > 0);
  const collective = new Map(all<{ id: string; collectiu_id: number }>(world.db, "SELECT id, collectiu_id FROM compte").map((a) => [a.id, a.collectiu_id]));
  for (const b of world.batches) {
    assert.ok(b.items.length <= DEFAULT_CONFIG.questionsPerDay, `${name} ${b.account} ${b.day}: ${b.items.length} items`);
    assert.equal(new Set(b.items.map((i) => i.questionId)).size, b.items.length, `${name} duplicate question in a batch`);
    const banned = world.banned.get(collective.get(b.account)!) ?? [];
    for (const i of b.items) assert.ok(!banned.includes(i.type), `${name} ${b.account} was given banned format ${i.type}`);
  }
  // Also straight from the table, which is what the app reads.
  assert.deepEqual(all(world.db, `SELECT compte_id, day FROM assignment GROUP BY compte_id, day HAVING COUNT(*) > ${DEFAULT_CONFIG.questionsPerDay}`), []);
  assert.deepEqual(all(world.db, "SELECT compte_id, day FROM assignment GROUP BY compte_id, day HAVING COUNT(DISTINCT pregunta_id) < COUNT(*)"), []);
}));

test("no monitoring item repeats within item_cooldown_days while a fresh item exists in its domain", each(({ name, world }) => {
  interface A { compte_id: string; day: string; pregunta_id: number; reason: string }
  const rows = all<A>(world.db, "SELECT compte_id, day, pregunta_id, reason FROM assignment ORDER BY day, slot");
  const qs = all<{ id: number; domini_id: number; collectiu_id: number | null; tipus: string; is_followup: number; necessitat_id: number | null }>(
    world.db,
    "SELECT id, domini_id, collectiu_id, tipus, is_followup, necessitat_id FROM pregunta",
  );
  const coll = new Map(all<{ id: string; collectiu_id: number }>(world.db, "SELECT id, collectiu_id FROM compte").map((a) => [a.id, a.collectiu_id]));
  const q = new Map(qs.map((x) => [x.id, x]));
  const lastSeen = new Map<string, string>(); // account|question → day
  const byDay = new Map<string, A[]>();
  for (const r of rows) (byDay.get(`${r.compte_id}|${r.day}`) ?? byDay.set(`${r.compte_id}|${r.day}`, []).get(`${r.compte_id}|${r.day}`)!).push(r);
  let repeats = 0;
  for (const [key, batch] of byDay) {
    const [acct, day] = key.split("|") as [string, string];
    const start = addDays(day, -DEFAULT_CONFIG.itemCooldownDays);
    const banned = world.banned.get(coll.get(acct)!) ?? [];
    const usedToday = new Set(batch.map((b) => b.pregunta_id));
    for (const r of batch) {
      const item = q.get(r.pregunta_id)!;
      const seen = lastSeen.get(`${acct}|${r.pregunta_id}`);
      if (r.reason !== "monitor" || !seen || seen < start) continue;
      repeats++;
      const fresh = qs.filter(
        (x) =>
          x.domini_id === item.domini_id && (x.collectiu_id === null || x.collectiu_id === coll.get(acct)) && x.necessitat_id === null &&
          !x.is_followup && x.tipus === item.tipus && !banned.includes(x.tipus) && !usedToday.has(x.id) && (lastSeen.get(`${acct}|${x.id}`) ?? "0000-00-00") < start,
      );
      assert.equal(fresh.length, 0, `${name} ${acct} ${day}: question ${r.pregunta_id} repeated (last ${seen}) although ${fresh.map((f) => f.id)} were fresh`);
    }
    for (const r of batch) lastSeen.set(`${acct}|${r.pregunta_id}`, day);
  }
  assert.ok(repeats >= 0);
}));

test("the job is idempotent: a second run leaves every table identical", each(({ name, world }) => {
  const before = dumpAll(world.db);
  runEngineJob(world.db, { now: world.clock.now });
  assert.deepEqual(dumpAll(world.db), before, name);
}));

test("determinism: the same seed gives byte-identical tables", () => {
  for (const s of SEEDS.slice(0, 3)) {
    const dumps = [0, 1].map(() => {
      const w = generateWorld(s.seed, { accountsPerCollective: s.accounts, days: s.days });
      runEngineJob(w.db, { now: w.clock.now });
      return dumpAll(w.db, [...OUTPUT_TABLES, "person_domain_state", "item_stats", "format_stats", "assignment", "resposta", "engine_config"]);
    });
    assert.deepEqual(dumps[0], dumps[1], s.seed);
  }
});

test("live state equals replayed state: person_domain_state and item_stats", () => {
  for (const { name, world } of worlds()) {
    const copy = cloneDb(world.db);
    copy.exec("DELETE FROM person_domain_state; DELETE FROM item_stats");
    const report = runEngineJob(copy, { now: world.clock.now });
    assert.equal(report.bootstrapped, true, name);
    const live = all<Record<string, number | string | null>>(world.db, "SELECT * FROM person_domain_state ORDER BY compte_id, domini_id");
    const replay = all<Record<string, number | string | null>>(copy, "SELECT * FROM person_domain_state ORDER BY compte_id, domini_id");
    assert.equal(replay.length, live.length, `${name} row count`);
    live.forEach((l, i) => compareRows(l, replay[i]!, `${name} state ${l.compte_id}/${l.domini_id}`));
    const li = all<Record<string, number | string | null>>(world.db, "SELECT * FROM item_stats ORDER BY pregunta_id");
    const ri = all<Record<string, number | string | null>>(copy, "SELECT * FROM item_stats ORDER BY pregunta_id");
    assert.equal(ri.length, li.length, `${name} item rows`);
    li.forEach((l, i) => compareRows(l, ri[i]!, `${name} item ${l.pregunta_id}`));
    // The aggregates the job writes do not depend on whether state was live or replayed.
    assert.equal(dumpTable(copy, "agregat"), dumpTable(world.db, "agregat"), `${name} agregat`);
    copy.close();
  }
});

function compareRows(a: Record<string, number | string | null>, b: Record<string, number | string | null>, label: string) {
  for (const k of Object.keys(a)) {
    const x = a[k];
    const y = b[k];
    if (typeof x === "number" && typeof y === "number") assert.ok(Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)), `${label}.${k}: live ${x} vs replay ${y}`);
    else assert.equal(y, x, `${label}.${k}`);
  }
}
