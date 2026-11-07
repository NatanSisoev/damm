// HR-side engine API: question validation and configuration. No per-account data is reachable from here.
import { QUESTION_TYPES, type QuestionType } from "@damm/shared";
import { run, transaction, type SqlDatabase } from "./db.ts";

export { getConfig, setConfig, ConfigError, DEFAULT_CONFIG, ENGINE_VERSION } from "./config.ts";
export {
  listInsights,
  latestInsightPeriod,
  listAlarms,
  alarmCounts,
  setAlarmStatus,
  ALARM_TRANSITIONS,
  AlarmTransitionError,
} from "./read.ts";
export { startProbe, listProbes, stopProbe, ProbeError, MAX_PROBE_BOOST, MAX_PROBE_DAYS } from "./probe.ts";
export type { StartProbeInput, ProbeView, ProbeProgress, ProbeStatus, ListProbesQuery } from "./probe.ts";
export type {
  Viewer,
  InsightView,
  InsightDetails,
  InsightQuery,
  InsightKind,
  SegmentLabels,
  Snapshot,
  ShiftGroup,
  AlarmView,
  AlarmQuery,
  AlarmStatus,
  AlarmType,
  Audience,
  Severity,
} from "./read.ts";

export interface QuestionDraft {
  type: string;
  text: string;
  domainId: number;
  facet?: string | null;
  polarity?: number;
  /** pair/choice: [{label, score}]; ranking: [{label, domain_id | domainId}] */
  options?: Array<{ label?: unknown; score?: unknown; domain_id?: unknown; domainId?: unknown }> | null;
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export function validateQuestion(q: QuestionDraft, knownDomainIds?: number[]): ValidationResult {
  const errors: string[] = [];
  const type = q.type as QuestionType;
  if (!QUESTION_TYPES.includes(type)) errors.push(`unknown type "${q.type}"`);
  if (!q.text || !q.text.trim()) errors.push("text is empty");
  if (knownDomainIds && !knownDomainIds.includes(q.domainId)) errors.push(`unknown domain ${q.domainId}`);
  if (q.polarity !== undefined && q.polarity !== 1 && q.polarity !== -1) errors.push("polarity must be 1 or -1");
  if (q.facet !== undefined && q.facet !== null && !/^[a-z0-9_]{2,64}$/.test(q.facet)) errors.push("facet must be snake_case (a-z, 0-9, _)");

  const opts = q.options ?? null;
  const needsOptions = type === "pair" || type === "choice" || type === "ranking";
  if (!needsOptions && opts && opts.length) errors.push(`${type} takes no options`);
  if (needsOptions) {
    const [min, max] = type === "pair" ? [2, 2] : [3, 5];
    if (!opts || opts.length < min || opts.length > max) errors.push(`${type} needs ${min === max ? min : `${min}-${max}`} options`);
    for (const [i, o] of (opts ?? []).entries()) {
      if (typeof o.label !== "string" || !o.label.trim()) errors.push(`option ${i}: label is empty`);
      if (type === "ranking") {
        const d = o.domain_id ?? o.domainId;
        if (typeof d !== "number" || (knownDomainIds && !knownDomainIds.includes(d))) errors.push(`option ${i}: needs a valid domain_id`);
      } else if (typeof o.score !== "number" || o.score < 0 || o.score > 1) errors.push(`option ${i}: score must be in 0..1`);
    }
    if (type !== "ranking" && opts && opts.length) {
      const scores = opts.map((o) => o.score as number);
      if (new Set(scores).size !== scores.length) errors.push("option scores must differ");
    }
    if (q.polarity === -1) errors.push(`${type} options are already oriented; leave polarity at 1`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** All domains stay active: weight must be > 0. collectiuId null = default for every collective. */
export function setDomainWeight(db: SqlDatabase, w: { collectiuId: number | null; dominiId: number; weight: number }): void {
  if (!(w.weight > 0) || !Number.isFinite(w.weight)) throw new RangeError("domain weight must be > 0");
  transaction(db, () => {
    run(db, "DELETE FROM domain_weight WHERE collectiu_id IS ? AND domini_id = ?", w.collectiuId, w.dominiId);
    run(db, "INSERT INTO domain_weight (collectiu_id, domini_id, weight) VALUES (?,?,?)", w.collectiuId, w.dominiId, w.weight);
  });
}

/** weight 0 = this format is never shown to the collective. */
export function setFormatPreference(db: SqlDatabase, p: { collectiuId: number | null; type: QuestionType; weight: number }): void {
  if (!QUESTION_TYPES.includes(p.type)) throw new RangeError(`unknown type ${p.type}`);
  if (!(p.weight >= 0) || !Number.isFinite(p.weight)) throw new RangeError("format weight must be >= 0");
  transaction(db, () => {
    run(db, "DELETE FROM format_preference WHERE collectiu_id IS ? AND tipus = ?", p.collectiuId, p.type);
    run(db, "INSERT INTO format_preference (collectiu_id, tipus, weight) VALUES (?,?,?)", p.collectiuId, p.type, p.weight);
  });
}
