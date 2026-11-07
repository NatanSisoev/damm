// Segment score, confidence and consensus. docs/engine.md section 4. Pure.
import type { EngineConfig } from "./config.ts";

export interface PersonPoint {
  level: number;
  variance: number;
  /** Days since this person's last answer in the domain, relative to the reference time. */
  daysSince: number;
}

export interface SegmentStats {
  nEff: number;
  /** Mean level 0..1. */
  mean: number;
  /** Between-person spread (variance) on 0..1. */
  spread: number;
  se: number;
  /** 0..10 */
  score: number;
  /** 0..100 */
  confidence: number;
  /** 0..100 */
  consensus: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
const MAX_SD = 0.5; // largest possible sd of a variable on [0, 1]

export function finish(mean: number, spread: number, se: number, nEff: number, cfg: EngineConfig): SegmentStats {
  return {
    nEff,
    mean,
    spread,
    se,
    score: round2(10 * mean),
    confidence: round2(100 * clamp01(1 - se / cfg.seTolerance)),
    consensus: round2(100 * clamp01(1 - Math.sqrt(spread) / MAX_SD)),
  };
}

/** SE² = (1 − f) · (s² + P̄ + c) / (n_eff + 1), f = n_eff / N (finite population correction). */
export function standardError(nEff: number, N: number, spread: number, pBar: number, cfg: EngineConfig): number {
  const f = N > 0 ? Math.min(1, nEff / N) : 0;
  return Math.sqrt(((1 - f) * (spread + pBar + cfg.smallSampleVariance)) / (nEff + 1));
}

export function recencyWeight(daysSince: number, cfg: EngineConfig): number {
  return Math.pow(0.5, Math.max(0, daysSince) / cfg.halfLifeDays);
}

/** Stats for one homogeneous stratum. N = population size of the stratum. */
export function segmentStats(points: PersonPoint[], N: number, cfg: EngineConfig, priorLevel = cfg.priors.level): SegmentStats {
  let nEff = 0;
  let sum = 0;
  let pSum = 0;
  for (const p of points) {
    const w = recencyWeight(p.daysSince, cfg);
    nEff += w;
    sum += w * p.level;
    pSum += w * p.variance;
  }
  if (nEff === 0) {
    // No information: prior mean, prior uncertainty.
    return finish(priorLevel, 0, Math.sqrt(cfg.priors.variance), 0, cfg);
  }
  const mean = sum / nEff;
  let ss = 0;
  for (const p of points) ss += recencyWeight(p.daysSince, cfg) * (p.level - mean) ** 2;
  const spread = ss / nEff;
  const pBar = pSum / nEff;
  return finish(mean, spread, standardError(nEff, N, spread, pBar, cfg), nEff, cfg);
}

/** Expected drop in SE² from one more answer in this segment (value of information). */
export function infoGain(points: PersonPoint[], N: number, cfg: EngineConfig): number {
  const st = segmentStats(points, N, cfg);
  const pBar = points.length ? points.reduce((s, p) => s + p.variance, 0) / points.length : cfg.priors.variance;
  const after = standardError(st.nEff + 1, N, st.spread, pBar, cfg);
  return Math.max(0, st.se ** 2 - after ** 2);
}

/**
 * Combines strata (e.g. shifts within a collective) at population weights, so a silent stratum
 * keeps its prior uncertainty and lowers the combined confidence.
 */
export function combineStrata(strata: { N: number; stats: SegmentStats }[], cfg: EngineConfig): SegmentStats {
  const total = strata.reduce((s, x) => s + x.N, 0);
  if (total === 0 || strata.length === 0) return finish(cfg.priors.level, 0, Math.sqrt(cfg.priors.variance), 0, cfg);
  let mean = 0;
  let se2 = 0;
  let nEff = 0;
  for (const { N, stats } of strata) {
    const w = N / total;
    mean += w * stats.mean;
    se2 += w * w * stats.se ** 2;
    nEff += stats.nEff;
  }
  let spread = 0;
  for (const { N, stats } of strata) spread += (N / total) * (stats.spread + (stats.mean - mean) ** 2);
  return finish(mean, spread, Math.sqrt(se2), nEff, cfg);
}
