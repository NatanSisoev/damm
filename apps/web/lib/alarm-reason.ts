// Why an alarm has its severity, in one line, and the confidence of the score it rests on.
// Pure: reads the stored severity, confidence and the figures in the engine's description, and states the rule
// of packages/engine/src/alarms.ts that applies (thresholds come from ALARM_DEFAULTS, never copied here).
import type { Lang } from "@damm/shared";
import { makeT } from "@/lib/i18n/core";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { pointsUnit } from "@/lib/signal-text";
import { ALARM_DEFAULTS as T } from "@/lib/hr-engine";

export interface AlarmReasonInput {
  tipus: string;
  descripcio: string;
  severity: string;
  n: number;
  /** Stored confidence of the current score: 0..100 (a 0..1 value is read as a fraction). */
  confidence: number | null;
}

const dec = (x: number, lang: Lang, digits = 1) => {
  const s = Number(x.toFixed(digits)).toString();
  return lang === "en" ? s : s.replace(".", ",");
};

/** Confidence as a whole percentage, or null when the alarm has none (changepoint, participation). */
export function alarmConfidence(c: number | null): number | null {
  return c === null ? null : Math.round(c <= 1 ? c * 100 : c);
}

/** "Confiança 82 %", or null. */
export function alarmConfidenceLabel(c: number | null, lang: Lang): string | null {
  const v = alarmConfidence(c);
  return v === null ? null : makeT(hrResultsDict, lang)("ar_conf", { c: v });
}

/** One sentence for the severity, or null for the types that have no severity rule (weak signal, low confidence, improvement, theme). */
export function alarmReason(a: AlarmReasonInput, lang: Lang = "ca"): string | null {
  const t = makeT(hrResultsDict, lang);
  const c = alarmConfidence(a.confidence);
  const d = a.descripcio;
  const sev = a.severity;
  const numbers = (m: RegExpMatchArray | null) => (m ? m[1].split("→").map((v) => Number(v.trim())) : []);
  const ser = numbers(d.match(/\(\s*(-?[\d.]+(?:\s*→\s*-?[\d.]+)+)\s*\)/));

  if (a.tipus === "sustained_decline" || a.tipus === "sharp_drop") {
    const sharp = a.tipus === "sharp_drop";
    const fell = d.match(/fell\s+([\d.]+)\s+points?/i);
    const fall = ser.length >= 2 ? ser[0] - ser[ser.length - 1] : fell ? Number(fell[1]) : null;
    if (fall === null || !Number.isFinite(fall) || c === null) return null;
    const need = sharp ? T.criticalDrop : T.sharpDropTrigger;
    const x = dec(fall, lang);
    const u = pointsUnit(x, true, lang);
    const m = dec(need, lang);
    const highConf = c >= T.criticalConfidence;
    if (sev === "critical") {
      if (fall >= need && highConf) return t("ar_crit_fall", { x, c, u });
      return t("ar_crit_score", { s: dec(T.criticalScore, lang) });
    }
    if (sev === "info") return t("ar_info", { x, u, f: dec(T.logFall, lang), s: dec(T.logScoreFloor, lang) });
    if (fall >= need && !highConf) return t("ar_warn_lowconf", { x, u, c, k: T.criticalConfidence });
    return t("ar_warn_small", { x, u, m });
  }

  if (a.tipus === "polarisation") {
    const m = d.match(/fell\s+(\d+)\s+points?/i);
    if (!m || c === null) return null;
    const fall = Number(m[1]);
    const x = String(fall);
    const pt = pointsUnit(fall, false, lang);
    if (sev === "critical") return t("ar_crit_cons", { x, pt, c });
    if (fall >= T.criticalPolarisation && c < T.criticalConfidence) return t("ar_warn_cons_lowconf", { x, pt, c, k: T.criticalConfidence });
    return t("ar_warn_cons_small", { x, pt, m: T.criticalPolarisation });
  }

  if (a.tipus === "changepoint_cluster") {
    // The count is the group size, already >= the minimum group size.
    const critAt = 2 * Math.max(T.changepointTrigger, 10);
    return sev === "critical" ? t("ar_crit_cp", { n: a.n }) : t("ar_warn_cp", { n: a.n, m: critAt });
  }

  if (a.tipus === "baixa_participacio") {
    const m = d.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const crit = Math.round(T.criticalParticipation * 100);
    if (sev === "critical") return t("ar_crit_part", { m: crit });
    return m ? t("ar_warn_part", { x: m[1].replace(".", lang === "en" ? "." : ","), m: crit }) : null;
  }
  return null;
}
