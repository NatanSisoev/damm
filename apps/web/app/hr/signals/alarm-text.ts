// Alarm groupings and hints. The sentence itself comes from lib/signal-text.ts.
import type { Lang } from "@damm/shared";
import { makeT } from "@/lib/i18n/core";
import { hrResultsDict, type HrResultsKey } from "@/lib/i18n/hr-results";

export const NON_ACTIONABLE = new Set(["low_confidence", "improvement"]);

const HINTS = new Set<string>(["sustained_decline", "sharp_drop", "feble", "polarisation", "changepoint_cluster", "emergent", "baixa_participacio"]);

/** Why a person should care / what to look at next (UI language, default Catalan). */
export function alarmHint(type: string, lang: Lang = "ca"): string {
  return HINTS.has(type) ? makeT(hrResultsDict, lang)(`al_${type}` as HrResultsKey) : "";
}
