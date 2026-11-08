import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { bordaWeights, parseAnswer, type QuestionDef } from "../src/normalize.ts";
import { newPersonState, observe } from "../src/person.ts";
import { combineStrata, segmentStats } from "../src/segment.ts";
import { chooseFormat } from "../src/thompson.ts";
import { createRng, sampleBeta, weightedSampleWithoutReplacement } from "../src/rng.ts";
import { updateItemStats } from "../src/item-bias.ts";

const cfg = DEFAULT_CONFIG;
const q = (over: Partial<QuestionDef>): QuestionDef => ({
  id: 1, domainId: 1, collectiuId: null, type: "scale10", text: "t", facet: "f", polarity: 1,
  options: null, isFollowup: false, needId: null, priority: 0, ...over,
});

test("normalise: every closed type maps to 0..1 with 1 = best", () => {
  assert.equal((parseAnswer(q({ type: "scale10" }), { valorNum: 8 }) as any).value.score, 0.8);
  assert.equal((parseAnswer(q({ type: "scale5" }), { valorNum: 2 }) as any).value.score, 0.25);
  assert.equal((parseAnswer(q({ type: "scale5", polarity: -1 }), { valorNum: 5 }) as any).value.score, 0);
  assert.equal((parseAnswer(q({ type: "yes_no" }), { valorNum: 1 }) as any).value.score, 1);
  const pair = q({ type: "pair", options: [{ label: "a", score: 0.9 }, { label: "b", score: 0.1 }] });
  assert.equal((parseAnswer(pair, { valorNum: 1 }) as any).value.score, 0.1);
  assert.deepEqual(parseAnswer(q({ type: "scale10" }), { valorNum: 11 }), { ok: false, reason: "invalid_value" });
  assert.deepEqual(parseAnswer(q({ type: "scale5" }), { valorNum: 2.5 }), { ok: false, reason: "invalid_value" });
  assert.deepEqual(parseAnswer(pair, { valorNum: 2 }), { ok: false, reason: "invalid_value" });
});

test("normalise: ranking needs a full permutation and yields Borda weights, no score", () => {
  const opts = [{ label: "a", domainId: 1 }, { label: "b", domainId: 2 }, { label: "c", domainId: 3 }, { label: "d", domainId: 6 }];
  const rq = q({ type: "ranking", options: opts });
  const ok = parseAnswer(rq, { valueJson: [3, 0, 1, 2] });
  assert.ok(ok.ok && ok.value.score === null);
  assert.deepEqual(parseAnswer(rq, { valueJson: [0, 0, 1, 2] }), { ok: false, reason: "invalid_value" });
  const w = bordaWeights(opts, [3, 0, 1, 2]);
  assert.equal(w.get(6), 1);
  assert.equal(w.get(3), 0);
  assert.ok(Math.abs(w.get(1)! - 2 / 3) < 1e-9);
});

test("normalise: open needs a comment", () => {
  assert.deepEqual(parseAnswer(q({ type: "open" }), { comentari: "  " }), { ok: false, reason: "missing_comment" });
  assert.ok(parseAnswer(q({ type: "open" }), { comentari: "hola" }).ok);
});

test("person filter: tracks a stable trajectory and flags a sharp drop for follow-up", () => {
  const rng = createRng(1);
  let s = newPersonState(0.6, cfg, "2026-08-01 09:00:00");
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(2026, 7, 2 + i * 7)).toISOString().slice(0, 10);
    s = observe(s, { y: 0.8, noiseSd: 0.1, at: `${day} 09:00:00`, day, isFollowup: false }, cfg, rng).state;
  }
  assert.ok(Math.abs(s.level - 0.8) < 0.03, `level ${s.level}`);
  const drop = observe(s, { y: 0.2, noiseSd: 0.1, at: "2026-10-01 09:00:00", day: "2026-10-01", isFollowup: false }, cfg, rng);
  assert.equal(drop.followup, "scheduled");
  assert.ok(drop.z < -cfg.followupZ);
  assert.ok(drop.state.followupDue! >= "2026-10-04" && drop.state.followupDue! <= "2026-10-08");

  const confirm = observe(drop.state, { y: 0.25, noiseSd: 0.1, at: "2026-10-05 09:00:00", day: "2026-10-05", isFollowup: true }, cfg, rng);
  assert.equal(confirm.followup, "confirmed");
  assert.equal(confirm.state.confirmedChangeDir, -1);
  assert.equal(confirm.state.pendingFollowupLevel, null);

  const noise = observe(drop.state, { y: 0.8, noiseSd: 0.1, at: "2026-10-05 09:00:00", day: "2026-10-05", isFollowup: true }, cfg, rng);
  assert.equal(noise.followup, "noise");
  assert.equal(noise.state.confirmedChangeAt, null);
});

test("segment: everyone answered identically gives confidence 100 and consensus 100", () => {
  const pts = Array.from({ length: 20 }, () => ({ level: 0.7, variance: 0, daysSince: 0 }));
  const st = segmentStats(pts, 20, cfg);
  assert.equal(st.confidence, 100);
  assert.equal(st.consensus, 100);
  assert.ok(Math.abs(st.score - 7) < 1e-9);
});

test("segment: disagreement lowers consensus and confidence; time lowers confidence", () => {
  const agree = segmentStats(Array.from({ length: 40 }, () => ({ level: 0.5, variance: 0.005, daysSince: 0 })), 200, cfg);
  const split = segmentStats(Array.from({ length: 40 }, (_, i) => ({ level: i % 2 ? 0.2 : 0.8, variance: 0.005, daysSince: 0 })), 200, cfg);
  assert.ok(split.consensus < agree.consensus);
  assert.ok(split.confidence < agree.confidence);
  const stale = segmentStats(Array.from({ length: 40 }, () => ({ level: 0.5, variance: 0.005, daysSince: 60 })), 200, cfg);
  assert.ok(stale.confidence < agree.confidence);
});

test("segment: a silent stratum lowers the combined confidence", () => {
  const full = segmentStats(Array.from({ length: 30 }, () => ({ level: 0.6, variance: 0.004, daysSince: 0 })), 50, cfg);
  const empty = segmentStats([], 50, cfg);
  const both = combineStrata([{ N: 50, stats: full }, { N: 50, stats: full }], cfg);
  const oneSilent = combineStrata([{ N: 50, stats: full }, { N: 50, stats: empty }], cfg);
  assert.ok(oneSilent.confidence < both.confidence);
});

test("item bias is shrunk towards 0", () => {
  let s = { bias: 0, n: 0, residSum: 0 };
  s = updateItemStats(s, 0.2, 20);
  assert.ok(Math.abs(s.bias - 0.2 / 21) < 1e-12);
});

test("thompson: never picks a banned format and favours the better arm", () => {
  const rng = createRng(7);
  let good = 0;
  for (let i = 0; i < 500; i++) {
    const t = chooseFormat(rng, [
      { type: "yes_no", alpha: 40, beta: 10, pref: 1 },
      { type: "scale10", alpha: 10, beta: 40, pref: 1 },
      { type: "ranking", alpha: 100, beta: 1, pref: 0 },
    ]);
    assert.notEqual(t, "ranking");
    if (t === "yes_no") good++;
  }
  // Expected share ≈ 0.1 + 0.8 · 0.8 = 0.74: the better arm leads, the weaker one still runs.
  assert.ok(good > 320 && good < 420, `yes_no ${good}/500`);
});

const shares = (arms: Parameters<typeof chooseFormat>[1], n = 4000, seed = 11) => {
  const rng = createRng(seed);
  const c = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const t = chooseFormat(rng, arms)!;
    c.set(t, (c.get(t) ?? 0) + 1);
  }
  return (t: string) => (c.get(t) ?? 0) / n;
};

test("thompson: a format weight is a lean, not a ranking", () => {
  // Equal quality, weights 3 : 1 → about 0.1 + 0.8 · 0.75 = 0.70 vs 0.30, not ~100% vs 0%.
  const s = shares([
    { type: "yes_no", alpha: 20, beta: 20, pref: 3 },
    { type: "scale10", alpha: 20, beta: 20, pref: 1 },
  ]);
  assert.ok(s("yes_no") > 0.64 && s("yes_no") < 0.76, `yes_no ${s("yes_no")}`);
  assert.ok(s("scale10") > 0.24 && s("scale10") < 0.36, `scale10 ${s("scale10")}`);
});

test("thompson: every allowed format keeps a minimum share; weight 0 stays banned", () => {
  const s = shares([
    { type: "yes_no", alpha: 50, beta: 2, pref: 100 },
    { type: "scale10", alpha: 2, beta: 50, pref: 1 },
    { type: "scale5", alpha: 2, beta: 50, pref: 1 },
    { type: "ranking", alpha: 50, beta: 2, pref: 0 },
  ]);
  assert.ok(s("scale10") >= 0.085, `scale10 ${s("scale10")}`);
  assert.ok(s("scale5") >= 0.085, `scale5 ${s("scale5")}`);
  assert.equal(s("ranking"), 0);
  assert.equal(chooseFormat(createRng(1), [{ type: "yes_no", alpha: 1, beta: 1, pref: 0 }]), undefined);
  assert.equal(chooseFormat(createRng(1), [{ type: "pair", alpha: 1, beta: 1, pref: 0.2 }]), "pair");
});

test("rng: seeded and reproducible; beta samples in range", () => {
  const a = createRng("x|2026-10-01");
  const b = createRng("x|2026-10-01");
  assert.equal(a(), b());
  for (let i = 0; i < 100; i++) {
    const v = sampleBeta(a, 0.5, 3);
    assert.ok(v >= 0 && v <= 1);
  }
  const keys = weightedSampleWithoutReplacement(a, [{ key: 1, weight: 1 }, { key: 2, weight: 0 }, { key: 3, weight: 2 }], 3);
  assert.deepEqual([...keys].sort(), [1, 3]);
});

test("config: a partial nested override keeps the other keys", async () => {
  const { mergeConfig } = await import("../src/config.ts");
  const c = mergeConfig(DEFAULT_CONFIG, { noiseSd: { yes_no: 0.38 } as never, priors: { level: 0.7 } as never });
  assert.equal(c.noiseSd.yes_no, 0.38);
  assert.equal(c.noiseSd.scale10, DEFAULT_CONFIG.noiseSd.scale10);
  assert.equal(c.priors.level, 0.7);
  assert.equal(c.priors.variance, DEFAULT_CONFIG.priors.variance);
});
