import { test } from "node:test";
import assert from "node:assert/strict";
import { addPool, makeDb, T0 } from "./helpers.ts";
import { ConfigError, setConfig, setDomainWeight } from "../src/hr.ts";
import { clearDomainWeight, getBrain, resetConfig, simulateBrain } from "../src/hr.ts";

test("getBrain exposes parameters, weights and signals per collective", () => {
  const db = makeDb({ accountsPerCollective: 12 });
  addPool(db);
  setConfig(db, { questions_per_day: 4 });
  setDomainWeight(db, { collectiuId: 1, dominiId: 2, weight: 3 });
  const b = getBrain(db, { now: T0 });
  assert.equal(b.config.find((c) => c.key === "questions_per_day")!.value, 4);
  assert.equal(b.config.find((c) => c.key === "questions_per_day")!.overridden, true);
  const f = b.collectives.find((c) => c.id === 1)!;
  assert.equal(f.suppressed, false);
  assert.equal(f.domains.find((d) => d.domainId === 2)!.weight, 3);
  assert.equal(f.domains.find((d) => d.domainId === 2)!.weightSource, "collective");
  assert.ok(Math.abs(f.domains.reduce((s, d) => s + d.drawShare, 0) - 1) < 1e-9);
  assert.equal(f.pool.monitoring, 18);
  clearDomainWeight(db, 1, 2);
  assert.equal(getBrain(db, { now: T0 }).collectives[0]!.domains[1]!.weightSource, "none");
});

test("collectives under the minimum group size are suppressed", () => {
  const db = makeDb({ accountsPerCollective: 4 });
  addPool(db);
  const c = getBrain(db, { now: T0 }).collectives[0]!;
  assert.equal(c.suppressed, true);
  assert.equal(c.pendingFollowups, null);
  assert.ok(c.domains.every((d) => d.stats === null));
  assert.equal(simulateBrain(db, { collectiuId: 1, now: T0 }).neutralSignals, true);
});

test("simulateBrain honours config and weight what-ifs, deterministically, without storing anything", () => {
  const db = makeDb({ accountsPerCollective: 12 });
  addPool(db);
  const a = simulateBrain(db, { collectiuId: 1, days: 10, people: 60, now: T0 });
  assert.deepEqual(a, simulateBrain(db, { collectiuId: 1, days: 10, people: 60, now: T0 }));
  assert.ok(Math.abs(a.slotsPerDay - 3) < 1e-9);
  const more = simulateBrain(db, { collectiuId: 1, days: 10, people: 60, now: T0, config: { questions_per_day: 5 } });
  assert.ok(Math.abs(more.slotsPerDay - 5) < 1e-9);
  const heavy = simulateBrain(db, { collectiuId: 1, days: 10, people: 60, now: T0, domainWeights: { 3: 50 } });
  const share = (r: typeof a, d: number) => r.domainMix.find((x) => x.domainId === d)!.share;
  assert.ok(share(heavy, 3) > share(a, 3));
  const noYesNo = simulateBrain(db, { collectiuId: 1, days: 10, people: 60, now: T0, formatPreferences: { yes_no: 0 } });
  assert.ok(!noYesNo.typeMix.some((t) => t.type === "yes_no"));
  assert.equal(a.queue.length, 10);
  assert.throws(() => simulateBrain(db, { collectiuId: 1, now: T0, config: { nope: 1 } }), ConfigError);
  assert.equal(getBrain(db, { now: T0 }).config.every((c) => !c.overridden), true);
});

test("resetConfig drops stored values", () => {
  const db = makeDb();
  setConfig(db, { half_life_days: 7 });
  resetConfig(db, ["half_life_days"]);
  assert.equal(getBrain(db, { now: T0 }).config.find((c) => c.key === "half_life_days")!.overridden, false);
  assert.throws(() => resetConfig(db, ["engine_version"]), ConfigError);
});
