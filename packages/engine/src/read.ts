// Read API for the HR dashboard: insights and alarms, typed and filtered per viewer.
// Reads only aggregate output tables (`insight`, `senyal`); nothing per account is reachable from here.
import type { InsightKind } from "./insights.ts";
import type { AlarmType, Audience, Severity } from "./alarms.ts";
import { all, one, run, type SqlDatabase, type SqlValue } from "./db.ts";

export type { InsightKind, AlarmType, Audience, Severity };

// --- viewer ---------------------------------------------------------------------------------

/** Who is looking. HR sees everything; a manager sees only their own collective's `hr_manager` alarms. */
export type Viewer = { role: "hr" } | { role: "manager"; collectiuId: number };

// --- insights -------------------------------------------------------------------------------

export interface SegmentLabels {
  collective: string; // "All" for company-wide
  shift: string | null;
  domain: string | null;
}

/** One period's numbers for a segment. score 0..10, confidence and consensus 0..100. */
export interface Snapshot {
  periode: string;
  score: number;
  confidence: number;
  consensus: number;
  n: number;
}

export interface ShiftGroup {
  tornId: number | null;
  label: string | null;
  score: number;
  n: number;
}

/** `detail_json` per kind. Every detail has `labels`. */
export interface InsightDetails {
  domain_state: { labels: SegmentLabels; current: Snapshot; previous: Snapshot | null; delta: number | null };
  top_mover: { labels: SegmentLabels; rank: number; direction: "up" | "down"; current: Snapshot; previous: Snapshot; delta: number };
  polarisation: { labels: SegmentLabels; current: Snapshot; previous: Snapshot; consensusDrop: number; scoreDelta: number };
  importance_gap: {
    labels: SegmentLabels;
    importance: number; // 0..1, from rankings
    score: number; // 0..10
    priority: number; // importance × (1 − score/10)
    rank: number;
    quadrant: "act_first" | "maintain" | "monitor" | "low_priority";
    importanceN: number;
  };
  trajectory_mix: { labels: SegmentLabels; improving: number; stable: number; declining: number; windowDays: number; n: number }; // percentages
  followup_confirmation: { labels: SegmentLabels; resolved: number; confirmed: number; confirmedDown: number; confirmedUp: number; rate: number; n: number };
  segment_gap:
    | { dimension: "shift"; labels: SegmentLabels; lowest: ShiftGroup; highest: ShiftGroup; groups: ShiftGroup[]; gap: number }
    | {
        dimension: "manager";
        labels: SegmentLabels;
        managers: { score: number; confidence: number; n: number };
        others: { score: number; confidence: number; n: number };
        gap: number;
        asOf: string;
      };
  narrative: {
    labels: SegmentLabels; // collective "All" for company-wide; shift and domain are null
    summary: string;
    highlights: { text: string; domain: string | null; evidence: string }[];
    suggestedActions: {
      title: string;
      why: string;
      domain: string | null;
      followUpSurvey: string;
      alarmId: number | null; // open alarm it addresses (senyal.id)
      recommendationId: number | null; // recomanacio.id created for it, estat 'proposada'
    }[];
    recommendationIds: number[];
    model: string;
    inputHash: string;
  };
  driver: Record<string, unknown>;
  action_effect: Record<string, unknown>;
}

export type InsightView = {
  [K in InsightKind]: {
    id: number;
    kind: K;
    periode: string;
    collectiuId: number | null;
    tornId: number | null;
    domainId: number | null;
    n: number;
    /** Headline number of the card (see docs/engine-integration.md). null when suppressed. */
    value: number | null;
    detail: InsightDetails[K] | null;
    suppressed: boolean;
  };
}[InsightKind];

export interface InsightQuery {
  /** Default: the latest period that has insights. "all" = every period. */
  periode?: string | "all";
  kind?: InsightKind | InsightKind[];
  /** null = company-wide rows only; undefined = every collective. Managers are always limited to their own. */
  collectiuId?: number | null;
  domainId?: number;
  /** Include suppressed rows (n < 10) so the UI can show "not enough answers". Default false. */
  includeSuppressed?: boolean;
}

interface InsightRowDb {
  id: number;
  kind: InsightKind;
  periode: string;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number | null;
  n: number;
  value: number | null;
  detail_json: string | null;
  suprimit: number;
}

export function latestInsightPeriod(db: SqlDatabase): string | null {
  return one<{ p: string | null }>(db, "SELECT MAX(periode) AS p FROM insight")?.p ?? null;
}

/** Insights for a viewer, newest period first, then by kind and segment. */
export function listInsights(db: SqlDatabase, viewer: Viewer, q: InsightQuery = {}): InsightView[] {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const periode = q.periode ?? latestInsightPeriod(db);
  if (periode === null) return [];
  if (periode !== "all") {
    where.push("periode = ?");
    params.push(periode);
  }
  if (q.kind) {
    const kinds = Array.isArray(q.kind) ? q.kind : [q.kind];
    where.push(`kind IN (${kinds.map(() => "?").join(",")})`);
    params.push(...kinds);
  }
  const collective = viewer.role === "manager" ? viewer.collectiuId : q.collectiuId;
  if (collective === null) where.push("collectiu_id IS NULL");
  else if (collective !== undefined) {
    where.push("collectiu_id = ?");
    params.push(collective);
  }
  if (q.domainId !== undefined) {
    where.push("domini_id = ?");
    params.push(q.domainId);
  }
  if (!q.includeSuppressed) where.push("suprimit = 0");
  const rows = all<InsightRowDb>(
    db,
    `SELECT id, kind, periode, collectiu_id, torn_id, domini_id, n, value, detail_json, suprimit FROM insight
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY periode DESC, kind, collectiu_id IS NOT NULL, collectiu_id, torn_id, domini_id, id`,
    ...params,
  );
  return rows.map(
    (r) =>
      ({
        id: r.id,
        kind: r.kind,
        periode: r.periode,
        collectiuId: r.collectiu_id,
        tornId: r.torn_id,
        domainId: r.domini_id,
        n: r.n,
        value: r.suprimit ? null : r.value,
        detail: r.suprimit || !r.detail_json ? null : JSON.parse(r.detail_json),
        suppressed: r.suprimit === 1,
      }) as InsightView,
  );
}

// --- alarms ---------------------------------------------------------------------------------

export type AlarmStatus = "open" | "acknowledged" | "action_linked" | "resolved";

export interface AlarmView {
  id: number;
  type: AlarmType | "emergent" | "baixa_participacio";
  /** Human-readable English sentence written by the engine (or the analysis module for themes). */
  description: string;
  collectiuId: number | null;
  tornId: number | null;
  domainId: number | null;
  periode: string;
  n: number;
  confidence: number | null;
  severity: Severity;
  status: AlarmStatus;
  audience: Audience;
  createdAt: string; // SQLite UTC datetime
}

export interface AlarmQuery {
  /** Default: open, acknowledged and action_linked (everything not resolved). */
  status?: AlarmStatus | AlarmStatus[];
  severity?: Severity | Severity[];
  collectiuId?: number | null;
  domainId?: number;
  limit?: number;
}

const DEFAULT_ALARM_STATUSES: AlarmStatus[] = ["open", "acknowledged", "action_linked"];

interface AlarmRowDb {
  id: number;
  tipus: AlarmView["type"];
  descripcio: string;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number | null;
  periode: string;
  n: number;
  confianca: number | null;
  severity: Severity;
  status: AlarmStatus;
  audience: Audience;
  created_at: string;
}

/**
 * Alarms a viewer may see. Suppressed alarms (n < 10) are never returned.
 * Order: open first, then by severity (critical first), newest first.
 */
export function listAlarms(db: SqlDatabase, viewer: Viewer, q: AlarmQuery = {}): AlarmView[] {
  const where = ["suprimit = 0"];
  const params: SqlValue[] = [];
  const list = <T extends string>(col: string, v: T | T[] | undefined, fallback?: T[]) => {
    const xs = v === undefined ? fallback : Array.isArray(v) ? v : [v];
    if (!xs) return;
    where.push(`${col} IN (${xs.map(() => "?").join(",")})`);
    params.push(...xs);
  };
  list("status", q.status, DEFAULT_ALARM_STATUSES);
  list("severity", q.severity);
  if (viewer.role === "manager") {
    where.push("audience = 'hr_manager' AND collectiu_id = ?");
    params.push(viewer.collectiuId);
  } else if (q.collectiuId === null) where.push("collectiu_id IS NULL");
  else if (q.collectiuId !== undefined) {
    where.push("collectiu_id = ?");
    params.push(q.collectiuId);
  }
  if (q.domainId !== undefined) {
    where.push("domini_id = ?");
    params.push(q.domainId);
  }
  const rows = all<AlarmRowDb>(
    db,
    `SELECT id, tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, created_at
     FROM senyal WHERE ${where.join(" AND ")}
     ORDER BY status = 'open' DESC, CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC, id DESC
     ${q.limit ? "LIMIT ?" : ""}`,
    ...params,
    ...(q.limit ? [q.limit] : []),
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.tipus,
    description: r.descripcio,
    collectiuId: r.collectiu_id,
    tornId: r.torn_id,
    domainId: r.domini_id,
    periode: r.periode,
    n: r.n,
    confidence: r.confianca,
    severity: r.severity,
    status: r.status,
    audience: r.audience,
    createdAt: r.created_at,
  }));
}

/** Counts of visible, unresolved alarms per severity: for a badge in the dashboard header. */
export function alarmCounts(db: SqlDatabase, viewer: Viewer): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const a of listAlarms(db, viewer)) out[a.severity]++;
  return out;
}

/** Allowed human transitions. The engine itself only opens alarms and auto-resolves `open` ones. */
export const ALARM_TRANSITIONS: Record<AlarmStatus, AlarmStatus[]> = {
  open: ["acknowledged", "action_linked", "resolved"],
  acknowledged: ["action_linked", "resolved"],
  action_linked: ["resolved"],
  resolved: [],
};

export class AlarmTransitionError extends Error {}

/** HR action on an alarm. The caller must check that the user is HR. */
export function setAlarmStatus(db: SqlDatabase, id: number, status: AlarmStatus): AlarmView {
  const cur = one<{ status: AlarmStatus }>(db, "SELECT status FROM senyal WHERE id = ?", id);
  if (!cur) throw new AlarmTransitionError(`alarm ${id} not found`);
  if (!ALARM_TRANSITIONS[cur.status].includes(status)) throw new AlarmTransitionError(`cannot move alarm from ${cur.status} to ${status}`);
  run(db, "UPDATE senyal SET status = ? WHERE id = ?", status, id);
  const view = listAlarms(db, { role: "hr" }, { status: [status] }).find((a) => a.id === id);
  if (!view) throw new AlarmTransitionError(`alarm ${id} is suppressed`);
  return view;
}
