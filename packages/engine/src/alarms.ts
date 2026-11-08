// Alarms (docs/engine.md section 7). Runs after runEngineJob has written `agregat`; writes `senyal`.
// Reads only aggregate history plus a per-domain *count* of confirmed personal drops; nothing per account leaves here.
// AI proposes, a human decides: the engine only opens alarms, upgrades a persisting weak signal and auto-resolves
// alarms that are still `open`. Alarms a human moved to `acknowledged` or `action_linked` are never touched.
import { DEFAULT_CONFIG, resolveConfig, type EngineConfig } from "./config.ts";
import { all, one, run, transaction, type SqlDatabase } from "./db.ts";
import { addDays, dayOf, toMs, toSqlDatetime } from "./time.ts";
import { improvementAnchors, loadAnchors } from "./listen-again.ts";

export type AlarmType =
  | "sharp_drop"
  | "sustained_decline"
  | "changepoint_cluster"
  | "polarisation"
  | "feble"
  | "low_confidence"
  | "improvement"
  | "baixa_participacio";
export type Severity = "info" | "warning" | "critical";
export type Audience = "hr" | "hr_manager";

/**
 * Trigger and clear levels (hysteresis). Every constant that decides whether an alarm fires lives here, so tuning
 * is one place. See docs/engine.md section 7 for the reasoning.
 *
 * Gates every change claim passes (sharp_drop, sustained_decline, polarisation, feble, improvement):
 *   1. Size: both periods have at least `changeMinN` respondents (3x the minimum group size of 10).
 *   2. Effect: the move is at least a per-type number of score points (0..10 scale), not just a non-zero move.
 *   3. Significance: the z-score of the period difference reaches `zWarning` (or `zInfo` for info-level types). The
 *      standard error is read back from the stored confidence (confidence = 100 * (1 - SE/0.05), so SE10 = 0.5 * (1 - c/100)).
 *   4. Breadth: the change must be too big for `breadthPeople` people to cause on their own (delta * n >= breadthPeople * 10).
 * Severity is tiered: critical only when the effect, the z-score and the breadth are all large.
 */
export interface AlarmThresholds {
  cooldownDays: number;
  /** Change claims need at least this many respondents in every period compared. Well above the minimum group size. */
  changeMinN: number;
  /** ...and at least this confidence (0..100) in each period, so the SE derived from it is trustworthy. */
  changeMinConfidence: number;
  /** z-score needed for a warning/critical claim: 2.58 = p < 0.01 (the screen runs on ~60 segments x 6 domains, so 0.05 is too loose). */
  zWarning: number;
  /** z-score needed for a critical claim: 3.29 = p < 0.001. */
  zCritical: number;
  /** z-score needed for an info-level claim (weak signals): 1.96 = p < 0.05. */
  zInfo: number;
  /** Breadth: a change that `breadthPeople` people, each moving the full 0..10 scale, could cause alone does not alarm. */
  breadthPeople: number;
  /** sharp_drop: score fell at least this much (0..10) vs. the previous period, significant and broad. Warning tier. */
  sharpDropTrigger: number;
  /** sharp_drop critical tier: fall of at least this much and z >= zCritical. */
  sharpDropCritical: number;
  sharpDropClear: number;
  /** sustained_decline: every step down by at least `sustainedMinStep` over the last `periods` periods, and the total fall is at least trigger. */
  sustainedPeriods: number;
  sustainedMinStep: number;
  sustainedTotalTrigger: number;
  /** Critical tier: total fall at least this much and z >= zCritical. */
  sustainedTotalCritical: number;
  /** Cleared when the total fall over the same window is below this. */
  sustainedTotalClear: number;
  /** changepoint_cluster: people in the segment with a confirmed drop in the domain within windowDays. */
  changepointTrigger: number;
  changepointClear: number;
  changepointWindowDays: number;
  /** ...and at least this share of the segment's respondents (0..1): 10 people in a segment of 300 is not a cluster. */
  changepointMinShare: number;
  /** Share of people expected to show a confirmed drop by chance in the window (confirmation is at 2 sigma). The count must beat it by zCritical. */
  changepointBaseRate: number;
  /** Critical tier: share of the segment at least this large. Otherwise warning. */
  changepointCriticalShare: number;
  /** polarisation: consensus fell at least this much (0..100) vs. the previous period, in a segment of at least polarisationMinN. */
  polarisationTrigger: number;
  polarisationClear: number;
  polarisationMinN: number;
  /** ...and consensus is now at or below this level (0..100); a fall that leaves opinions mostly aligned is not polarisation. */
  polarisationMaxConsensus: number;
  /** feble: steady fall of at least trigger (and less than sharpDropCritical) over `periods`, confidence rising, z >= zInfo. */
  feblePeriods: number;
  febleTrigger: number;
  febleClear: number;
  /** An open weak signal still triggering after this many days goes from info to warning. */
  feblePersistDays: number;
  /** low_confidence: confidence below trigger in two consecutive periods (or a full period when there is no earlier one), segment of at least lowConfidenceMinN. */
  lowConfidenceTrigger: number;
  lowConfidenceClear: number;
  lowConfidenceDays: number;
  lowConfidenceMinN: number;
  /** improvement: score rose at least trigger since the period before an adopted recommendation or a recorded context event, significantly. */
  improvementTrigger: number;
  improvementClear: number;
  /** baixa_participacio: response rate (respondents / population) below trigger, or share of respondents below
   *  shareRatioTrigger x share of the population, AND significantly below the rest of the company (z <= -zWarning).
   *  The rate path needs participationMinElapsedDays of the period gone (early in a month every rate is low).
   *  Cleared only when both are back above the clear levels. */
  participationTrigger: number;
  participationClear: number;
  shareRatioTrigger: number;
  shareRatioClear: number;
  participationMinElapsedDays: number;
  /** Segments smaller than this are not judged on participation. */
  participationMinPopulation: number;
}

/**
 * Minimum confidence (0-100) an estimate must have before it can back a change alarm (sharp drop, sustained decline,
 * polarisation, weak signal, improvement). Higher = rarer alarms. Override without a code change with the env var
 * `ALARM_MIN_CONFIDENCE`. `low_confidence` (about confidence itself), `changepoint_cluster`, `baixa_participacio`
 * and `emergent` have no score confidence and are gated by counts and z-tests instead.
 */
export const ALARM_MIN_CONFIDENCE = (() => {
  const v = Number(process.env.ALARM_MIN_CONFIDENCE);
  return process.env.ALARM_MIN_CONFIDENCE !== undefined && process.env.ALARM_MIN_CONFIDENCE !== "" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : 50;
})();

export const ALARM_DEFAULTS: AlarmThresholds = {
  cooldownDays: 7,
  changeMinN: 30,
  changeMinConfidence: ALARM_MIN_CONFIDENCE,
  zWarning: 2.58,
  zCritical: 3.29,
  zInfo: 1.96,
  breadthPeople: 3,
  sharpDropTrigger: 0.7,
  sharpDropCritical: 1.0,
  sharpDropClear: 0.4,
  sustainedPeriods: 3,
  sustainedMinStep: 0.15,
  sustainedTotalTrigger: 0.6,
  sustainedTotalCritical: 1.2,
  sustainedTotalClear: 0.3,
  changepointTrigger: 10,
  changepointClear: 5,
  changepointWindowDays: 14,
  changepointMinShare: 0.15,
  changepointBaseRate: 0.05,
  changepointCriticalShare: 0.25,
  polarisationTrigger: 20,
  polarisationClear: 10,
  polarisationMinN: 50,
  polarisationMaxConsensus: 60,
  feblePeriods: 3,
  febleTrigger: 0.4,
  febleClear: 0.2,
  feblePersistDays: 14,
  lowConfidenceTrigger: 35,
  lowConfidenceClear: 45,
  lowConfidenceDays: 28,
  lowConfidenceMinN: 30,
  improvementTrigger: 0.6,
  improvementClear: 0.3,
  participationTrigger: 0.4,
  participationClear: 0.45,
  shareRatioTrigger: 0.7,
  shareRatioClear: 0.8,
  participationMinElapsedDays: 14,
  participationMinPopulation: 30,
};

export const ALARM_SEVERITY: Record<AlarmType, Severity> = {
  sharp_drop: "critical",
  sustained_decline: "warning",
  changepoint_cluster: "critical",
  polarisation: "warning",
  feble: "info",
  low_confidence: "info",
  improvement: "info",
  baixa_participacio: "warning",
};

export const ALARM_AUDIENCE: Record<AlarmType, Audience> = {
  sharp_drop: "hr_manager",
  sustained_decline: "hr_manager",
  changepoint_cluster: "hr_manager",
  polarisation: "hr",
  feble: "hr",
  low_confidence: "hr",
  improvement: "hr_manager",
  baixa_participacio: "hr",
};

export interface AlarmOptions {
  now: number;
  config?: Partial<EngineConfig>;
  thresholds?: Partial<AlarmThresholds>;
}

export interface AlarmReport {
  opened: number;
  resolved: number;
  suppressed: number;
}

interface AggRow {
  periode: string;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number;
  n: number;
  score: number | null;
  confidence: number | null;
  consensus: number | null;
  suprimit: number;
}

interface SenyalRow {
  id: number;
  tipus: AlarmType;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number | null;
  periode: string;
  severity: Severity;
  status: "open" | "acknowledged" | "action_linked" | "resolved";
  created_at: string;
  suprimit: number;
}

/** Outcome of evaluating one alarm type on one segment × domain. */
export interface Evaluation {
  /** Trigger level reached: open if no alarm is active and the cooldown has passed. */
  trigger: boolean;
  /** Clear level reached: resolve an alarm that is still `open`. Between the two levels nothing changes. */
  clear: boolean;
  /** The data behind it has n < minGroupSize: hide open alarms, open nothing. */
  suppressed?: boolean;
  n: number;
  confidence: number | null;
  description: string;
  /** Tier chosen by the evaluator; falls back to ALARM_SEVERITY[type]. */
  severity?: Severity;
}

const NONE: Evaluation = { trigger: false, clear: false, n: 0, confidence: null, description: "" };

type Point = { score: number; confidence: number; consensus: number; n: number };

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

// ---- Statistics helpers ----------------------------------------------------------------------------------------

/** Standard error of a score on the 0..10 scale, read back from its confidence (confidence = 100 * (1 - SE/0.05), SE on 0..1). */
export const scoreSe = (confidence: number) => Math.max(0.02, 0.5 * (1 - Math.min(Math.max(confidence, 0), 100) / 100));

/** z-score of `a.score - b.score`, treating the two periods as independent estimates. Positive = a is higher. */
export function zOfDifference(a: Point, b: Point): number {
  return (a.score - b.score) / Math.hypot(scoreSe(a.confidence), scoreSe(b.confidence));
}

/** A change of `delta` points in a segment of `n` people is broad when more than `breadthPeople` people would have to move the whole scale to cause it. */
export const isBroad = (delta: number, n: number, t: AlarmThresholds) => Math.abs(delta) * n >= t.breadthPeople * 10;

/** Both ends of a comparison are large and reliable enough to claim a change. */
const comparable = (a: Point, b: Point, t: AlarmThresholds) =>
  a.n >= t.changeMinN && b.n >= t.changeMinN && a.confidence >= t.changeMinConfidence && b.confidence >= t.changeMinConfidence;

// ---- Pure evaluators. `hist` is the segment's per-period history, oldest first, ending at the current period;
// null marks a period that is missing or suppressed. ------------------------------------------------------------

function lastTwo(hist: (Point | null)[]): [Point, Point] | null {
  const cur = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  return cur && prev ? [prev, cur] : null;
}

export function evalSharpDrop(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const p = lastTwo(hist);
  if (!p) return NONE;
  const [prev, cur] = p;
  const drop = prev.score - cur.score;
  const z = zOfDifference(prev, cur);
  const significant = comparable(prev, cur, t) && drop >= t.sharpDropTrigger && z >= t.zWarning && isBroad(drop, cur.n, t);
  return {
    trigger: significant,
    clear: drop < t.sharpDropClear,
    n: cur.n,
    confidence: cur.confidence,
    severity: significant && drop >= t.sharpDropCritical && z >= t.zCritical ? "critical" : "warning",
    description: `Score fell ${fmt(drop)} points (${fmt(prev.score)} → ${fmt(cur.score)}, z=${fmt(z)}) since the previous period.`,
  };
}

export function evalSustainedDecline(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const w = hist.slice(-t.sustainedPeriods);
  if (w.length < t.sustainedPeriods || w.some((x) => x === null)) return NONE;
  const pts = w as Point[];
  const xs = pts.map((x) => x.score);
  const total = xs[0]! - xs[xs.length - 1]!;
  const everyStep = xs.every((x, i) => i === 0 || xs[i - 1]! - x >= t.sustainedMinStep);
  const first = pts[0]!;
  const cur = pts[pts.length - 1]!;
  const z = zOfDifference(first, cur);
  const significant =
    everyStep && pts.every((x) => x.n >= t.changeMinN && x.confidence >= t.changeMinConfidence) && total >= t.sustainedTotalTrigger && z >= t.zWarning && isBroad(total, cur.n, t);
  return {
    trigger: significant,
    clear: total < t.sustainedTotalClear,
    n: cur.n,
    confidence: cur.confidence,
    severity: significant && total >= t.sustainedTotalCritical && z >= t.zCritical ? "critical" : "warning",
    description: `Score declined ${w.length} periods in a row (${xs.map(fmt).join(" → ")}, z=${fmt(z)}).`,
  };
}

export function evalPolarisation(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const p = lastTwo(hist);
  if (!p) return NONE;
  const [prev, cur] = p;
  const fall = prev.consensus - cur.consensus;
  const reliable = cur.n >= t.polarisationMinN && prev.n >= t.polarisationMinN && cur.confidence >= t.changeMinConfidence && prev.confidence >= t.changeMinConfidence;
  return {
    trigger: reliable && fall >= t.polarisationTrigger && cur.consensus <= t.polarisationMaxConsensus,
    clear: fall < t.polarisationClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Consensus fell ${Math.round(fall)} points (${Math.round(prev.consensus)} → ${Math.round(cur.consensus)}): opinions are splitting.`,
  };
}

export function evalWeakSignal(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const w = hist.slice(-t.feblePeriods);
  if (w.length < t.feblePeriods || w.some((x) => x === null)) return NONE;
  const pts = w as Point[];
  const xs = pts.map((x) => x.score);
  const fall = xs[0]! - xs[xs.length - 1]!;
  const steady = xs.every((x, i) => i === 0 || x <= xs[i - 1]!);
  const first = pts[0]!;
  const cur = pts[pts.length - 1]!;
  const rising = cur.confidence > first.confidence;
  const z = zOfDifference(first, cur);
  return {
    trigger: steady && rising && comparable(first, cur, t) && fall >= t.febleTrigger && fall < t.sharpDropCritical && z >= t.zInfo && isBroad(fall, cur.n, t),
    clear: fall < t.febleClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Small steady decline of ${fmt(fall)} points over ${pts.length} periods with rising confidence (z=${fmt(z)}).`,
  };
}

/** `daysIntoCurrent`: days of the current period already elapsed (capped at the period length by the caller). */
export function evalLowConfidence(hist: (Point | null)[], daysIntoCurrent: number, t: AlarmThresholds): Evaluation {
  const cur = hist[hist.length - 1];
  if (!cur) return NONE;
  const prev = hist[hist.length - 2];
  const low = cur.confidence < t.lowConfidenceTrigger && cur.n >= t.lowConfidenceMinN;
  // Persistence: low in two consecutive periods; with no earlier period, a whole period of data has to be in.
  const persisted = prev != null ? prev.confidence < t.lowConfidenceTrigger : daysIntoCurrent >= t.lowConfidenceDays;
  return {
    trigger: low && persisted,
    clear: cur.confidence >= t.lowConfidenceClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Confidence is low (${Math.round(cur.confidence)}/100): results for this domain are not yet reliable.`,
  };
}

export function evalImprovement(baseline: Point | null, cur: Point | null, t: AlarmThresholds, since?: string): Evaluation {
  if (!baseline || !cur) return NONE;
  const rise = cur.score - baseline.score;
  const z = zOfDifference(cur, baseline);
  return {
    trigger: comparable(baseline, cur, t) && rise >= t.improvementTrigger && z >= t.zWarning && isBroad(rise, cur.n, t),
    clear: rise < t.improvementClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Score rose ${fmt(rise)} points (${fmt(baseline.score)} → ${fmt(cur.score)}, z=${fmt(z)}) since ${since ?? "an action was adopted"}; this does not show the action caused it.`,
  };
}

/**
 * `count`: people with a confirmed drop in the window. `segmentN`: respondents in the segment (the denominator).
 * Fires only when the count is large in absolute terms, a real share of the segment, and well beyond the chance rate.
 */
export function evalChangepointCluster(count: number, windowDays: number, t: AlarmThresholds, minN: number, segmentN: number): Evaluation {
  const share = segmentN > 0 ? count / segmentN : 0;
  const expected = segmentN * t.changepointBaseRate;
  const z = segmentN > 0 ? (count - expected) / Math.sqrt(Math.max(expected * (1 - t.changepointBaseRate), 1e-9)) : 0;
  const significant = count >= Math.max(t.changepointTrigger, minN) && share >= t.changepointMinShare && z >= t.zCritical;
  return {
    // Only the count is output, so it must itself respect the minimum group size.
    trigger: significant,
    clear: count < t.changepointClear || share < t.changepointMinShare / 2,
    n: count,
    confidence: null,
    severity: significant && share >= t.changepointCriticalShare ? "critical" : "warning",
    description: `${count} people (${Math.round(share * 100)}% of this segment) show a confirmed drop in this domain in the last ${windowDays} days.`,
  };
}

/** Counts for one non-nesting segment in the current period (respondents are distinct accounts, counted here only). */
export interface ParticipationCounts {
  respondents: number;
  population: number;
  totalRespondents: number;
  totalPopulation: number;
}

const TORN_CA: Record<string, string> = { mati: "matí", tarda: "tarda", nit: "nit" };

/** `where` is the Catalan place phrase, e.g. "al torn de nit de Fàbriques". `daysIntoPeriod`: days of the period elapsed (default: all of it). */
export function evalLowParticipation(c: ParticipationCounts, where: string, t: AlarmThresholds, minN: number, daysIntoPeriod = Infinity): Evaluation {
  const { respondents, population } = c;
  if (population < minN || respondents < minN) return { ...NONE, suppressed: true, n: respondents };
  const rate = respondents / population;
  const ratio = c.totalRespondents > 0 && c.totalPopulation > 0 ? respondents / c.totalRespondents / (population / c.totalPopulation) : 1;
  const pct = (x: number) => Math.round(x * 100);
  // Significance against the rest of the company: two-proportion z with a pooled variance.
  const restPop = c.totalPopulation - population;
  const restResp = c.totalRespondents - respondents;
  let z = 0;
  if (restPop > 0 && population > 0) {
    const pooled = c.totalRespondents / c.totalPopulation;
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / population + 1 / restPop));
    z = se > 0 ? (rate - restResp / restPop) / se : 0;
  }
  const rateLow = rate < t.participationTrigger && daysIntoPeriod >= t.participationMinElapsedDays;
  const ratioLow = ratio < t.shareRatioTrigger;
  return {
    trigger: population >= t.participationMinPopulation && (rateLow || ratioLow) && z <= -t.zWarning,
    clear: rate >= t.participationClear && ratio >= t.shareRatioClear,
    n: respondents,
    confidence: null,
    description:
      `Participació baixa ${where}: ${pct(rate)}% (n=${respondents} de ${population}). ` +
      `Pes a la mostra ${pct(respondents / c.totalRespondents)}% davant ${pct(population / c.totalPopulation)}% de la plantilla.`,
  };
}

/** Lideratge alarms go to HR only, never to the manager being assessed; company-wide alarms have no manager. */
export function audienceFor(type: AlarmType, collectiuId: number | null, dominiId: number, leadershipId: number | null): Audience {
  if (dominiId === leadershipId || collectiuId === null) return "hr";
  return ALARM_AUDIENCE[type];
}

// ---- IO -------------------------------------------------------------------------------------------------------

const segKey = (c: number | null, t: number | null, d: number | null) => `${c}|${t}|${d}`;
const alarmKey = (type: string, c: number | null, t: number | null, d: number | null) => `${type}|${segKey(c, t, d)}`;
const ACTIVE = new Set(["open", "acknowledged", "action_linked"]);

export function runAlarms(db: SqlDatabase, opts: AlarmOptions): AlarmReport {
  const cfg: EngineConfig = resolveConfig(db, opts.config);
  const t: AlarmThresholds = { ...ALARM_DEFAULTS, ...opts.thresholds };
  const minN = cfg.minGroupSize ?? DEFAULT_CONFIG.minGroupSize;
  const nowSql = toSqlDatetime(opts.now);
  const today = dayOf(opts.now, cfg.timezone);
  const nowPeriod = today.slice(0, 7);
  const report: AlarmReport = { opened: 0, resolved: 0, suppressed: 0 };

  const periods = all<{ periode: string }>(db, "SELECT DISTINCT periode FROM agregat WHERE periode <= ? ORDER BY periode", nowPeriod).map(
    (r) => r.periode,
  );
  if (periods.length === 0) return report;
  const current = periods[periods.length - 1]!;
  const leadershipId = one<{ id: number }>(db, "SELECT id FROM domini WHERE nom = 'Lideratge'")?.id ?? null;

  // History per segment × domain, aligned to `periods`; null = missing or suppressed.
  const rows = all<AggRow>(
    db,
    "SELECT periode, collectiu_id, torn_id, domini_id, n, score, confidence, consensus, suprimit FROM agregat WHERE periode <= ? AND domini_id IS NOT NULL",
    nowPeriod,
  );
  const hist = new Map<string, { c: number | null; t: number | null; d: number; pts: (Point | null)[]; curN: number | null }>();
  const idx = new Map(periods.map((p, i) => [p, i]));
  for (const r of rows) {
    const k = segKey(r.collectiu_id, r.torn_id, r.domini_id);
    let h = hist.get(k);
    if (!h) hist.set(k, (h = { c: r.collectiu_id, t: r.torn_id, d: r.domini_id, pts: periods.map(() => null), curN: null }));
    const ok = !r.suprimit && r.n >= minN && r.score !== null && r.confidence !== null && r.consensus !== null;
    h.pts[idx.get(r.periode)!] = ok ? { score: r.score!, confidence: r.confidence!, consensus: r.consensus!, n: r.n } : null;
    if (r.periode === current) h.curN = r.n;
  }

  // Existing alarms: the most recent one per key decides dedup and cooldown.
  const existing = all<SenyalRow>(
    db,
    "SELECT id, tipus, collectiu_id, torn_id, domini_id, periode, severity, status, created_at, suprimit FROM senyal ORDER BY created_at, id",
  );
  const latest = new Map<string, SenyalRow>();
  const active = new Map<string, SenyalRow>();
  for (const s of existing) {
    const k = alarmKey(s.tipus, s.collectiu_id, s.torn_id, s.domini_id);
    latest.set(k, s);
    if (ACTIVE.has(s.status)) active.set(k, s);
  }

  // Days of the current period already elapsed (for low_confidence when only one period exists).
  const periodStart = `${current}-01`;
  const daysIntoCurrent = current === nowPeriod ? Math.max(0, (toMs(today) - toMs(periodStart)) / 86_400_000) : t.lowConfidenceDays;

  // Changepoint counts per (collectiu, torn, domain). Only non-nesting segments are emitted so counts cannot be
  // differenced: collective × shift where the collective has shifts, the whole collective otherwise.
  const since = addDays(today, -t.changepointWindowDays);
  const cpRows = all<{ collectiu_id: number; torn_id: number | null; domini_id: number; k: number }>(
    db,
    `SELECT c.collectiu_id, c.torn_id, p.domini_id, COUNT(*) AS k
     FROM person_domain_state p JOIN compte c ON c.id = p.compte_id
     WHERE p.confirmed_change_dir = -1 AND p.confirmed_change_at >= ? AND p.confirmed_change_at <= ?
     GROUP BY c.collectiu_id, c.torn_id, p.domini_id`,
    since,
    today,
  );
  const cpCounts = new Map<string, number>();
  for (const r of cpRows) cpCounts.set(segKey(r.collectiu_id, r.torn_id, r.domini_id), r.k);
  const shifted = new Set(
    all<{ collectiu_id: number }>(db, "SELECT DISTINCT collectiu_id FROM empleat_sintetic WHERE torn_id IS NOT NULL").map((r) => r.collectiu_id),
  );

  // Adoption anchors (approved recommendation, HR-recorded context event). Baseline = the period before the anchor's. No completion state.
  const anchorOf = improvementAnchors(loadAnchors(db, cfg.timezone), periods, current);

  const insert = db.prepare(
    `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, created_at, suprimit)
     VALUES (?,?,?,?,?,?,?,?,?, 'open', ?,?, 0)`,
  );

  const apply = (type: AlarmType, c: number | null, tn: number | null, d: number | null, e: Evaluation) => {
    const k = alarmKey(type, c, tn, d);
    const act = active.get(k);
    if (e.suppressed) {
      if (act && act.status === "open" && !act.suprimit) {
        run(db, "UPDATE senyal SET suprimit = 1, confianca = NULL WHERE id = ?", act.id);
        report.suppressed++;
      }
      return;
    }
    if (act) {
      if (act.status !== "open") return; // a human owns it now
      if (act.suprimit) run(db, "UPDATE senyal SET suprimit = 0, confianca = ? WHERE id = ?", e.confidence, act.id); // n is back to >= minN
      if (e.clear) {
        run(db, "UPDATE senyal SET status = 'resolved' WHERE id = ?", act.id);
        active.delete(k);
        report.resolved++;
      } else if (type === "feble" && e.trigger && act.severity === "info" && toMs(nowSql) - toMs(act.created_at) >= t.feblePersistDays * 86_400_000) {
        run(db, "UPDATE senyal SET severity = 'warning' WHERE id = ?", act.id);
      }
      return;
    }
    if (!e.trigger) return;
    const last = latest.get(k);
    if (last && toMs(nowSql) - toMs(last.created_at) < t.cooldownDays * 86_400_000) return;
    insert.run(type, e.description, c, tn, d, current, e.n, e.confidence, e.severity ?? ALARM_SEVERITY[type], d === null ? "hr" : audienceFor(type, c, d, leadershipId), nowSql);
    report.opened++;
  };

  // Participation per non-nesting segment (same rule as changepoint_cluster, so counts cannot be differenced).
  // Distinct respondents are counted here and leave only as per-segment totals; no account id is kept.
  const segOf = (c: number, tn: number | null) => (shifted.has(c) ? segKey(c, tn, null) : segKey(c, null, null));
  const popBySeg = new Map<string, { c: number; t: number | null; n: number }>();
  for (const r of all<{ collectiu_id: number; torn_id: number | null; n: number }>(
    db,
    "SELECT collectiu_id, torn_id, COUNT(*) AS n FROM empleat_sintetic GROUP BY collectiu_id, torn_id",
  )) {
    const tn = shifted.has(r.collectiu_id) ? r.torn_id : null;
    const k = segOf(r.collectiu_id, r.torn_id);
    const e = popBySeg.get(k);
    if (e) e.n += r.n;
    else popBySeg.set(k, { c: r.collectiu_id, t: tn, n: r.n });
  }
  const respBySeg = new Map<string, number>();
  for (const r of all<{ collectiu_id: number; torn_id: number | null; n: number }>(
    db,
    `SELECT c.collectiu_id, c.torn_id, COUNT(DISTINCT r.compte_id) AS n
     FROM resposta r JOIN compte c ON c.id = r.compte_id WHERE r.periode = ? GROUP BY c.collectiu_id, c.torn_id`,
    current,
  ))
    respBySeg.set(segOf(r.collectiu_id, r.torn_id), (respBySeg.get(segOf(r.collectiu_id, r.torn_id)) ?? 0) + r.n);
  const names = {
    c: new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM collectiu").map((r) => [r.id, r.nom])),
    t: new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM torn").map((r) => [r.id, r.nom])),
  };
  const totalPop = [...popBySeg.values()].reduce((s, v) => s + v.n, 0);
  const totalResp = [...popBySeg.keys()].reduce((s, k) => s + (respBySeg.get(k) ?? 0), 0);

  transaction(db, () => {
    for (const [k, seg] of popBySeg) {
      const cn = names.c.get(seg.c) ?? `col·lectiu ${seg.c}`;
      const where = seg.t === null ? `a ${cn}` : `al torn de ${TORN_CA[names.t.get(seg.t) ?? ""] ?? names.t.get(seg.t) ?? seg.t} de ${cn}`;
      const counts = { respondents: respBySeg.get(k) ?? 0, population: seg.n, totalRespondents: totalResp, totalPopulation: totalPop };
      apply("baixa_participacio", seg.c, seg.t, null, evalLowParticipation(counts, where, t, minN, daysIntoCurrent));
    }
    for (const h of hist.values()) {
      const cur = h.pts[h.pts.length - 1] ?? null;
      // Current period missing or below the minimum group size: nothing can be said about this segment.
      if (!cur) {
        const sup: Evaluation = { ...NONE, suppressed: h.curN !== null && h.curN < minN };
        for (const type of ["sharp_drop", "sustained_decline", "polarisation", "feble", "low_confidence", "improvement"] as const)
          if (sup.suppressed) apply(type, h.c, h.t, h.d, sup);
        continue;
      }
      apply("sharp_drop", h.c, h.t, h.d, evalSharpDrop(h.pts, t));
      apply("sustained_decline", h.c, h.t, h.d, evalSustainedDecline(h.pts, t));
      apply("polarisation", h.c, h.t, h.d, evalPolarisation(h.pts, t));
      apply("feble", h.c, h.t, h.d, evalWeakSignal(h.pts, t));
      apply("low_confidence", h.c, h.t, h.d, evalLowConfidence(h.pts, daysIntoCurrent, t));
      const anchor = anchorOf.get(segKey(h.c, h.t, h.d));
      if (anchor !== undefined) {
        const bi = idx.get(anchor.baseline);
        apply("improvement", h.c, h.t, h.d, evalImprovement(bi === undefined ? null : h.pts[bi] ?? null, cur, t, anchor.since));
      }

      // Changepoint cluster on the non-nesting segments only.
      if (h.c !== null && (shifted.has(h.c) ? h.t !== null : h.t === null)) {
        const segN = cur.n;
        const count = h.t === null
          ? [...cpCounts].filter(([k]) => k.startsWith(`${h.c}|`) && k.endsWith(`|${h.d}`)).reduce((s, [, v]) => s + v, 0)
          : cpCounts.get(segKey(h.c, h.t, h.d)) ?? 0;
        apply("changepoint_cluster", h.c, h.t, h.d, evalChangepointCluster(count, t.changepointWindowDays, t, minN, segN));
      }
    }
  });
  return report;
}
