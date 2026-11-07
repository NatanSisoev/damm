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

/**
 * Draws θ ~ Beta(α, β) for every allowed format and returns the format maximising θ · pref.
 * Formats with little data have wide Betas, so they still get tried.
 */
export function chooseFormat(rng: Rng, arms: FormatArm[]): QuestionType | undefined {
  let best: QuestionType | undefined;
  let bestValue = -Infinity;
  for (const arm of arms) {
    if (arm.pref <= 0) continue;
    const v = sampleBeta(rng, arm.alpha, arm.beta) * arm.pref;
    if (v > bestValue) {
      bestValue = v;
      best = arm.type;
    }
  }
  return best;
}

/** Bayesian update: success = a careful answer. */
export function updateArm(alpha: number, beta: number, success: boolean): { alpha: number; beta: number } {
  return success ? { alpha: alpha + 1, beta } : { alpha, beta: beta + 1 };
}
