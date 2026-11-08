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

/** Trigger and clear levels (hysteresis). Kept local so config.ts stays untouched; see docs/engine.md section 7. */
export interface AlarmThresholds {
  cooldownDays: number;
  /** sharp_drop: score fell at least this much (0..10) vs. the previous period, with confidence >= minConfidence. */
  sharpDropTrigger: number;
  sharpDropClear: number;
  sharpDropMinConfidence: number;
  /** sustained_decline: every step negative over the last `periods` periods and mean slope <= -trigger per period. */
  sustainedPeriods: number;
  sustainedSlopeTrigger: number;
  /** Cleared when the mean slope over the same window is >= -clear. */
  sustainedSlopeClear: number;
  /** changepoint_cluster: people in the segment with a confirmed drop in the domain within windowDays. */
  changepointTrigger: number;
  changepointClear: number;
  changepointWindowDays: number;
  /** polarisation: consensus fell at least this much (0..100) vs. the previous period. */
  polarisationTrigger: number;
  polarisationClear: number;
  /** feble: steady fall of at least trigger (and less than sharpDropTrigger) over `periods`, confidence rising. */
  feblePeriods: number;
  febleTrigger: number;
  febleClear: number;
  /** An open weak signal still triggering after this many days goes from info to warning. */
  feblePersistDays: number;
  /** low_confidence: confidence below trigger for at least lowConfidenceDays. Cleared at >= clear. */
  lowConfidenceTrigger: number;
  lowConfidenceClear: number;
  lowConfidenceDays: number;
  /** improvement: score rose at least trigger since the period before an adopted recommendation or a recorded context event. */
  improvementTrigger: number;
  improvementClear: number;
  improvementMinConfidence: number;
  /** baixa_participacio: response rate (respondents / population) below trigger, or share of respondents below
   *  shareRatioTrigger × share of the population. Cleared only when both are back above the clear levels. */
  participationTrigger: number;
  participationClear: number;
  shareRatioTrigger: number;
  shareRatioClear: number;
  /** Severity per alarm instance (log / warning / critical), from magnitude and confidence. */
  /** Critical: score fall of at least this much with confidence >= criticalConfidence. */
  criticalDrop: number;
  criticalConfidence: number;
  /** Critical whatever the fall: the current score is below this level (0..10). */
  criticalScore: number;
  /** sustained_decline is only a log while the total fall is below this and the score is still >= logScoreFloor. */
  logFall: number;
  logScoreFloor: number;
  /** polarisation: critical when consensus fell at least this much with confidence >= criticalConfidence. */
  criticalPolarisation: number;
  /** baixa_participacio: critical when the response rate is below this. */
  criticalParticipation: number;
}

export const ALARM_DEFAULTS: AlarmThresholds = {
  cooldownDays: 7,
  sharpDropTrigger: 1.0,
  sharpDropClear: 0.5,
  sharpDropMinConfidence: 60,
  sustainedPeriods: 3,
  sustainedSlopeTrigger: 0.1,
  sustainedSlopeClear: 0,
  changepointTrigger: 10,
  changepointClear: 5,
  changepointWindowDays: 14,
  polarisationTrigger: 15,
  polarisationClear: 7.5,
  feblePeriods: 3,
  febleTrigger: 0.3,
  febleClear: 0.15,
  feblePersistDays: 14,
  lowConfidenceTrigger: 40,
  lowConfidenceClear: 50,
  lowConfidenceDays: 14,
  improvementTrigger: 0.5,
  improvementClear: 0.25,
  improvementMinConfidence: 60,
  participationTrigger: 0.4,
  participationClear: 0.45,
  shareRatioTrigger: 0.7,
  shareRatioClear: 0.8,
  criticalDrop: 1.5,
  criticalConfidence: 75,
  criticalScore: 4.5,
  logFall: 0.5,
  logScoreFloor: 5.5,
  criticalPolarisation: 30,
  criticalParticipation: 0.25,
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
  status: "open" | "acknowledged" | "action_linked" | "resolved" | "dismissed";
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
  /** Level for this instance; falls back to ALARM_SEVERITY[type]. */
  severity?: Severity;
}

const NONE: Evaluation = { trigger: false, clear: false, n: 0, confidence: null, description: "" };

type Point = { score: number; confidence: number; consensus: number; n: number };

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** Mean change per period over the series (first to last). */
const meanSlope = (xs: number[]) => (xs.length < 2 ? 0 : (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1));

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
  const critical = (drop >= t.criticalDrop && cur.confidence >= t.criticalConfidence) || cur.score < t.criticalScore;
  return {
    trigger: drop >= t.sharpDropTrigger && cur.confidence >= t.sharpDropMinConfidence,
    clear: drop < t.sharpDropClear,
    n: cur.n,
    confidence: cur.confidence,
    severity: critical ? "critical" : "warning",
    description: `Score fell ${fmt(drop)} points (${fmt(prev.score)} → ${fmt(cur.score)}) since the previous period.`,
  };
}

export function evalSustainedDecline(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const w = hist.slice(-t.sustainedPeriods);
  if (w.length < t.sustainedPeriods || w.some((x) => x === null)) return NONE;
  const xs = (w as Point[]).map((x) => x.score);
  const slope = meanSlope(xs);
  const allDown = xs.every((x, i) => i === 0 || x < xs[i - 1]!);
  const cur = w[w.length - 1]!;
  const fall = xs[0]! - xs[xs.length - 1]!;
  const severity: Severity =
    (fall >= t.sharpDropTrigger && cur.confidence >= t.criticalConfidence) || cur.score < t.criticalScore
      ? "critical"
      : fall < t.logFall && cur.score >= t.logScoreFloor
        ? "info"
        : "warning";
  return {
    trigger: allDown && slope <= -t.sustainedSlopeTrigger,
    clear: slope >= -t.sustainedSlopeClear,
    n: cur.n,
    confidence: cur.confidence,
    severity,
    description: `Score declined ${w.length} periods in a row (${xs.map(fmt).join(" → ")}).`,
  };
}

export function evalPolarisation(hist: (Point | null)[], t: AlarmThresholds): Evaluation {
  const p = lastTwo(hist);
  if (!p) return NONE;
  const [prev, cur] = p;
  const fall = prev.consensus - cur.consensus;
  return {
    trigger: fall >= t.polarisationTrigger,
    clear: fall < t.polarisationClear,
    n: cur.n,
    confidence: cur.confidence,
    severity: fall >= t.criticalPolarisation && cur.confidence >= t.criticalConfidence ? "critical" : "warning",
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
  const rising = pts[pts.length - 1]!.confidence > pts[0]!.confidence;
  return {
    trigger: steady && rising && fall >= t.febleTrigger && fall < t.sharpDropTrigger,
    clear: fall < t.febleClear,
    n: pts[pts.length - 1]!.n,
    confidence: pts[pts.length - 1]!.confidence,
    description: `Small steady decline of ${fmt(fall)} points over ${pts.length} periods with rising confidence.`,
  };
}

/** `daysIntoCurrent`: days of the current period already elapsed (capped at the period length by the caller). */
export function evalLowConfidence(hist: (Point | null)[], daysIntoCurrent: number, t: AlarmThresholds): Evaluation {
  const cur = hist[hist.length - 1];
  if (!cur) return NONE;
  const prev = hist[hist.length - 2];
  const low = cur.confidence < t.lowConfidenceTrigger;
  const persisted = (prev != null && prev.confidence < t.lowConfidenceTrigger) || daysIntoCurrent >= t.lowConfidenceDays;
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
  return {
    trigger: rise >= t.improvementTrigger && cur.confidence >= t.improvementMinConfidence,
    clear: rise < t.improvementClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Score rose ${fmt(rise)} points (${fmt(baseline.score)} → ${fmt(cur.score)}) since ${since ?? "an action was adopted"}; this does not show the action caused it.`,
  };
}

export function evalChangepointCluster(count: number, windowDays: number, t: AlarmThresholds, minN: number): Evaluation {
  return {
    // Only the count is output, so it must itself respect the minimum group size.
    trigger: count >= Math.max(t.changepointTrigger, minN),
    clear: count < t.changepointClear,
    n: count,
    confidence: null,
    severity: count >= 2 * Math.max(t.changepointTrigger, minN) ? "critical" : "warning",
    description: `${count} people in this segment show a confirmed drop in this domain in the last ${windowDays} days.`,
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

/** `where` is the Catalan place phrase, e.g. "al torn de nit de Fàbriques". */
export function evalLowParticipation(c: ParticipationCounts, where: string, t: AlarmThresholds, minN: number): Evaluation {
  const { respondents, population } = c;
  if (population < minN || respondents < minN) return { ...NONE, suppressed: true, n: respondents };
  const rate = respondents / population;
  const ratio = c.totalRespondents > 0 && c.totalPopulation > 0 ? respondents / c.totalRespondents / (population / c.totalPopulation) : 1;
  const pct = (x: number) => Math.round(x * 100);
  return {
    trigger: rate < t.participationTrigger || ratio < t.shareRatioTrigger,
    clear: rate >= t.participationClear && ratio >= t.shareRatioClear,
    n: respondents,
    confidence: null,
    severity: rate < t.criticalParticipation ? "critical" : "warning",
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
      } else if (e.trigger && e.severity && e.severity !== act.severity) {
        // Still triggering: the level follows the current magnitude (a fall that deepens becomes critical).
        run(db, "UPDATE senyal SET severity = ? WHERE id = ?", e.severity, act.id);
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
      apply("baixa_participacio", seg.c, seg.t, null, evalLowParticipation(counts, where, t, minN));
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
        const count = h.t === null
          ? [...cpCounts].filter(([k]) => k.startsWith(`${h.c}|`) && k.endsWith(`|${h.d}`)).reduce((s, [, v]) => s + v, 0)
          : cpCounts.get(segKey(h.c, h.t, h.d)) ?? 0;
        apply("changepoint_cluster", h.c, h.t, h.d, evalChangepointCluster(count, t.changepointWindowDays, t, minN));
      }
    }
  });
  return report;
}
