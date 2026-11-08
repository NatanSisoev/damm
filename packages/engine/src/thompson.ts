// Format choice by Thompson sampling. docs/engine.md section 5.
import type { QuestionType } from "@damm/shared";
import { sampleBeta, type Rng } from "./rng.ts";

export interface FormatArm {
  type: QuestionType;
  alpha: number;
  beta: number;
  /** HR preference weight for this collective. 0 = banned. */
  pref: number;
}

/** Share every allowed format keeps, so a low weight leans the mix instead of silencing a format. */
export const MIN_FORMAT_SHARE = 0.1;

/**
 * Draws θ ~ Beta(α, β) for every allowed format, then picks one at random with probability
 * proportional to θ · pref, mixed with a floor of MIN_FORMAT_SHARE per format (lower when there
 * are more than 1 / MIN_FORMAT_SHARE formats). pref is a lean, not a ranking: weight 3 vs 1 shows
 * the first format about three times as often, it does not show it every time. pref 0 = banned.
 */
export function chooseFormat(rng: Rng, arms: FormatArm[]): QuestionType | undefined {
  const allowed = arms.filter((a) => a.pref > 0);
  if (allowed.length === 0) return undefined;
  if (allowed.length === 1) return allowed[0]!.type;
  const scores = allowed.map((a) => sampleBeta(rng, a.alpha, a.beta) * a.pref);
  const total = scores.reduce((s, v) => s + v, 0);
  const floor = Math.min(MIN_FORMAT_SHARE, 1 / allowed.length);
  const rest = 1 - floor * allowed.length;
  let u = rng();
  for (let i = 0; i < allowed.length; i++) {
    const p = floor + rest * (total > 0 ? scores[i]! / total : 1 / allowed.length);
    if (u < p) return allowed[i]!.type;
    u -= p;
  }
  return allowed[allowed.length - 1]!.type;
}

/** Bayesian update: success = a careful answer. */
export function updateArm(alpha: number, beta: number, success: boolean): { alpha: number; beta: number } {
  return success ? { alpha: alpha + 1, beta } : { alpha, beta: beta + 1 };
}
