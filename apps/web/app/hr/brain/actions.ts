"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { brainDict } from "@/lib/i18n/hr-brain";
import { QUESTION_TYPES, type QuestionType } from "@damm/shared";
import {
  ConfigError, hrBrain, hrClearDomainWeight, hrClearFormatPreference, hrResetConfig, hrSetConfig, hrSetDomainWeight, hrSetFormatPreference, hrSimulate,
  type Brain, type SimResult,
} from "@/lib/hr-engine";

export type BrainResult = { ok: true; brain: Brain } | { ok: false; error: string };
export type SimOutcome = { ok: true; draft: SimResult; saved: SimResult } | { ok: false; error: string };

export interface SimRequest {
  collectiuId: number;
  tornId: number | null;
  days: number;
  people: number;
  config: Record<string, unknown>;
  domainWeights: Record<number, number>;
  formatPreferences: Partial<Record<QuestionType, number>>;
  probeBoosts: Record<number, number>;
  seed: string;
}

// Engine validation messages (ConfigError) come from the engine as they are; anything else gets a translated generic line.
const fail = async (e: unknown) => ({
  ok: false as const,
  error: e instanceof ConfigError || e instanceof RangeError ? e.message : (await getT(brainDict))("err_generic"),
});

// "Prova": runs the saved settings and the draft settings side by side. Nothing is stored.
export async function simulateAction(req: SimRequest): Promise<SimOutcome> {
  try {
    const base = { collectiuId: req.collectiuId, tornId: req.tornId, days: req.days, people: req.people, seed: req.seed };
    return {
      ok: true,
      saved: hrSimulate(base),
      draft: hrSimulate({ ...base, config: req.config, domainWeights: req.domainWeights, formatPreferences: req.formatPreferences, probeBoosts: req.probeBoosts }),
    };
  } catch (e) {
    console.error("simulateAction", e);
    return await fail(e);
  }
}

export async function saveConfigAction(patch: Record<string, unknown>): Promise<BrainResult> {
  try {
    hrSetConfig(patch);
    revalidatePath("/hr/brain");
    return { ok: true, brain: hrBrain() };
  } catch (e) {
    return await fail(e);
  }
}

export async function resetConfigAction(keys?: string[]): Promise<BrainResult> {
  try {
    hrResetConfig(keys);
    revalidatePath("/hr/brain");
    return { ok: true, brain: hrBrain() };
  } catch (e) {
    return await fail(e);
  }
}

/** Saves the weights and format preferences of one collective. A null value goes back to the general value. */
export async function saveWeightsAction(
  collectiuId: number,
  domainWeights: Record<number, number | null>,
  formatPreferences: Partial<Record<QuestionType, number | null>>,
): Promise<BrainResult> {
  try {
    for (const [d, w] of Object.entries(domainWeights)) {
      if (w === null) hrClearDomainWeight(collectiuId, Number(d));
      else hrSetDomainWeight(collectiuId, Number(d), w);
    }
    for (const [t, w] of Object.entries(formatPreferences)) {
      if (!QUESTION_TYPES.includes(t as QuestionType)) throw new RangeError((await getT(brainDict))("err_unknown_type", { type: t }));
      if (w === null || w === undefined) hrClearFormatPreference(collectiuId, t as QuestionType);
      else hrSetFormatPreference(collectiuId, t as QuestionType, w);
    }
    revalidatePath("/hr/brain");
    return { ok: true, brain: hrBrain() };
  } catch (e) {
    return await fail(e);
  }
}

export async function refreshBrainAction(): Promise<BrainResult> {
  try {
    return { ok: true, brain: hrBrain() };
  } catch (e) {
    return await fail(e);
  }
}
