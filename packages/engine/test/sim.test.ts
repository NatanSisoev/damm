import { test } from "node:test";
import assert from "node:assert/strict";
import { runSim } from "../sim/run.ts";
import { createWorld, D_CONDICIONS, D_LIDERATGE } from "../sim/world.ts";
import { createRng } from "../src/rng.ts";
import { loss, sampleKnobs } from "../sim/tune.ts";

test("world: planted signals are in the ground truth", () => {
  const w = createWorld({ seed: "t", participationScale: 0.3 });
  assert.equal(w.days, 92);
  assert.equal(w.people.length, 1200);
  assert.ok(w.accounts.length > 50 && w.accounts.length < 200);
  // Logística Condicions declines slowly from mid-August; Fàbriques Condicions drops in October.
  const log = (t: number) => w.trueMean(2, "any", D_CONDICIONS, t);
  assert.ok(log(91) < log(10) - 0.08);
  const fab = (t: number) => w.trueMean(1, "any", D_CONDICIONS, t);
  assert.ok(fab(55) - fab(70) > 0.08);
  assert.ok(Math.abs(fab(10) - fab(55)) < 0.03);
  // Personal drops are sharp and in Lideratge.
  assert.equal(w.personalDrops.length, 8);
  for (const d of w.personalDrops) {
    assert.equal(d.domainId, D_LIDERATGE);
    assert.ok(w.level(d.personIdx, D_LIDERATGE, d.onset - 1) - w.level(d.personIdx, D_LIDERATGE, d.onset) > 0.2);
  }
  // Item biases are centred per domain; every domain has a follow-up wording.
  for (let d = 1; d <= 6; d++) {
    const items = w.items.filter((i) => i.domainId === d);
    assert.ok(Math.abs(items.reduce((s, i) => s + i.bias, 0)) < 1e-9);
    assert.ok(items.some((i) => i.isFollowup));
    assert.ok(new Set(items.map((i) => i.type)).size >= 4);
  }
  // Same seed, same world.
  assert.equal(createWorld({ seed: "t", participationScale: 0.3 }).trueMean(null, "any", 1, 40), w.trueMean(null, "any", 1, 40));
});

test("world: managers answer more positively than their true level", () => {
  const w = createWorld({ seed: "m", managerBias: 0.2 });
  const item = w.items.find((i) => i.type === "scale10" && i.polarity === 1)!;
  const r = createRng(1);
  const avg = (manager: boolean) => {
    let s = 0;
    for (let i = 0; i < 4000; i++) s += w.answer(r, { idx: 0, collectiuId: 1, tornId: 1, manager, accountId: "x" }, item, 0).score;
    return s / 4000;
  };
  assert.ok(avg(true) - avg(false) > 0.15);
});

test("sim smoke: drives the real engine and reports metrics", () => {
  const r = runSim({ world: { seed: "smoke", days: 21, participationScale: 0.12 }, checkpointEvery: 5 });
  assert.ok(r.accounts > 20);
  assert.equal(r.answers, r.accounts * r.days * 3);
  assert.ok(r.score.rows > 0 && Number.isFinite(r.score.rmse) && r.score.rmse < 2);
  assert.ok(r.calibration.rows > 0 && r.calibration.coverage >= 0 && r.calibration.coverage <= 1);
  assert.equal(r.signals.length, 1); // only the August signal starts within 21 days
  const share = Object.values(r.questionShare.byDomain).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(share - 1) < 0.01);
  assert.equal(Object.keys(r.questionShare.byDomain).length, 6);
  assert.ok(r.noise.yes_no!.realised > r.noise.scale10!.realised);
  assert.ok(Number.isFinite(loss(r)));
});

test("tune: sampled knobs are valid engine config", () => {
  const r = createRng(3);
  for (let i = 0; i < 50; i++) {
    const k = sampleKnobs(r);
    assert.ok(k.halfLifeDays >= 7 && k.halfLifeDays <= 42);
    assert.ok(k.processNoisePerDay > 0 && k.followupZ > 1);
    for (const v of Object.values(k.noiseSd)) assert.ok(v > 0);
  }
});
