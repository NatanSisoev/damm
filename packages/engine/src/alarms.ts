// Alarms (docs/engine.md section 7). Runs after runEngineJob has written `agregat`; writes `senyal`.
// Reads only aggregate history plus a per-domain *count* of confirmed personal drops; nothing per account leaves here.
// AI proposes, a human decides: the engine only opens alarms, upgrades a persisting weak signal and auto-resolves
// alarms that are still `open`. Alarms a human moved to `acknowledged` or `action_linked` are never touched.
import { DEFAULT_CONFIG, loadConfig, type EngineConfig } from "./config.ts";
import { all, one, run, transaction, type SqlDatabase } from "./db.ts";
import { addDays, dayOf, toMs, toSqlDatetime } from "./time.ts";

export type AlarmType =
  | "sharp_drop"
  | "sustained_decline"
  | "changepoint_cluster"
  | "polarisation"
  | "feble"
  | "low_confidence"
  | "improvement";
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
  /** improvement: score rose at least trigger since the period of an alarm with a linked action. */
  improvementTrigger: number;
  improvementClear: number;
  improvementMinConfidence: number;
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
};

export const ALARM_SEVERITY: Record<AlarmType, Severity> = {
  sharp_drop: "critical",
  sustained_decline: "warning",
  changepoint_cluster: "critical",
  polarisation: "warning",
  feble: "info",
  low_confidence: "info",
  improvement: "info",
};

export const ALARM_AUDIENCE: Record<AlarmType, Audience> = {
  sharp_drop: "hr_manager",
  sustained_decline: "hr_manager",
  changepoint_cluster: "hr_manager",
  polarisation: "hr",
  feble: "hr",
  low_confidence: "hr",
  improvement: "hr_manager",
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
  return {
    trigger: drop >= t.sharpDropTrigger && cur.confidence >= t.sharpDropMinConfidence,
    clear: drop < t.sharpDropClear,
    n: cur.n,
    confidence: cur.confidence,
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
  return {
    trigger: allDown && slope <= -t.sustainedSlopeTrigger,
    clear: slope >= -t.sustainedSlopeClear,
    n: cur.n,
    confidence: cur.confidence,
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

export function evalImprovement(baseline: Point | null, cur: Point | null, t: AlarmThresholds): Evaluation {
  if (!baseline || !cur) return NONE;
  const rise = cur.score - baseline.score;
  return {
    trigger: rise >= t.improvementTrigger && cur.confidence >= t.improvementMinConfidence,
    clear: rise < t.improvementClear,
    n: cur.n,
    confidence: cur.confidence,
    description: `Score rose ${fmt(rise)} points (${fmt(baseline.score)} → ${fmt(cur.score)}) since an action was linked.`,
  };
}

export function evalChangepointCluster(count: number, windowDays: number, t: AlarmThresholds, minN: number): Evaluation {
  return {
    // Only the count is output, so it must itself respect the minimum group size.
    trigger: count >= Math.max(t.changepointTrigger, minN),
    clear: count < t.changepointClear,
    n: count,
    confidence: null,
    description: `${count} people in this segment show a confirmed drop in this domain in the last ${windowDays} days.`,
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
  const cfg: EngineConfig = { ...loadConfig(db), ...opts.config };
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

  // Linked actions: alarm with status action_linked, or with an approved recommendation. Baseline = its period.
  const linked = all<{ collectiu_id: number | null; torn_id: number | null; domini_id: number; periode: string }>(
    db,
    `SELECT s.collectiu_id, s.torn_id, s.domini_id, MAX(s.periode) AS periode FROM senyal s
     WHERE s.domini_id IS NOT NULL AND s.tipus <> 'improvement'
       AND (s.status = 'action_linked' OR EXISTS (SELECT 1 FROM recomanacio r WHERE r.senyal_id = s.id AND r.estat = 'aprovada'))
     GROUP BY s.collectiu_id, s.torn_id, s.domini_id`,
  );
  const baselinePeriod = new Map(linked.map((l) => [segKey(l.collectiu_id, l.torn_id, l.domini_id), l.periode]));

  const insert = db.prepare(
    `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, created_at, suprimit)
     VALUES (?,?,?,?,?,?,?,?,?, 'open', ?,?, 0)`,
  );

  const apply = (type: AlarmType, c: number | null, tn: number | null, d: number, e: Evaluation) => {
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
    insert.run(type, e.description, c, tn, d, current, e.n, e.confidence, ALARM_SEVERITY[type], audienceFor(type, c, d, leadershipId), nowSql);
    report.opened++;
  };

  transaction(db, () => {
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
      const bp = baselinePeriod.get(segKey(h.c, h.t, h.d));
      if (bp !== undefined && bp < current) {
        const bi = idx.get(bp);
        apply("improvement", h.c, h.t, h.d, evalImprovement(bi === undefined ? null : h.pts[bi] ?? null, cur, t));
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
