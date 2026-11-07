// "Indagar" probe: HR asks the engine to sample one domain more in one segment for a while. docs/engine.md, "Probes".
// A probe targets a segment (collective, optional shift), never accounts. startProbe/listProbes/stopProbe are HR-side
// and read only aggregates; updateProbeProgress runs in the engine job (the one place that may read raw answers).
import { all, one, run, type SqlDatabase } from "./db.ts";
import { resolveConfig, type EngineConfig } from "./config.ts";
import { toMs, toSqlDatetime } from "./time.ts";

const DAY_MS = 86_400_000;
export const MAX_PROBE_BOOST = 10;
export const MAX_PROBE_DAYS = 90;

export class ProbeError extends Error {}

export interface StartProbeInput {
  /** The alarm this probe investigates, if any. */
  senyalId?: number | null;
  collectiuId: number;
  /** Narrow to one shift. Omit for the whole collective. */
  tornId?: number | null;
  dominiId: number;
  /** Multiplier on the domain's monitoring priority. 1 < boost <= 10. Default 2. */
  boost?: number;
  /** Length in days. 0 < days <= 90. Default 14. */
  days?: number;
  /** Clock in epoch ms. Default Date.now(). */
  now?: number;
}

export type ProbeStatus = "active" | "expired" | "stopped";

export interface ProbeProgress {
  /** Fewer than the minimum group size answered: all numbers are hidden. */
  suppressed: boolean;
  /** Answers in the domain and segment since the probe started. */
  answers: number | null;
  /** Answers over an equally long window before it started (null if that window had too few people). */
  answersBefore: number | null;
  /** answers - answersBefore: what the probe added. */
  extraAnswers: number | null;
  /** How many different people answered (a count, never who). */
  people: number | null;
  confidenceBefore: number | null;
  confidenceNow: number | null;
  scoreBefore: number | null;
  scoreNow: number | null;
  /** When the engine job last updated these numbers. */
  updatedAt: string | null;
}

export interface ProbeView {
  id: number;
  senyalId: number | null;
  collectiuId: number;
  tornId: number | null;
  dominiId: number;
  boost: number;
  startsAt: string;
  endsAt: string;
  stoppedAt: string | null;
  status: ProbeStatus;
  /** Whole days left while active, else 0. */
  daysLeft: number;
  /** null until the engine job has run once for this probe. */
  progress: ProbeProgress | null;
}

interface ProbeRow {
  id: number;
  senyal_id: number | null;
  collectiu_id: number;
  torn_id: number | null;
  domini_id: number;
  boost: number;
  starts_at: string;
  ends_at: string;
  stopped_at: string | null;
  baseline_confidence: number | null;
  baseline_score: number | null;
  progress_at: string | null;
  answers_n: number | null;
  answers_before_n: number | null;
  respondents_n: number | null;
  confidence_now: number | null;
  score_now: number | null;
  suprimit: number;
}

/** Segment size from the synthetic population (else accounts): the representativeness denominator. */
function segmentSize(db: SqlDatabase, collectiuId: number, tornId: number | null): number {
  const where = "collectiu_id = ?" + (tornId === null ? "" : " AND torn_id = ?");
  const p = tornId === null ? [collectiuId] : [collectiuId, tornId];
  const synth = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM empleat_sintetic WHERE ${where}`, ...p)?.n ?? 0;
  const hasSynth = (one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM empleat_sintetic")?.n ?? 0) > 0;
  return hasSynth ? synth : (one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM compte WHERE ${where}`, ...p)?.n ?? 0);
}

/** Latest non-suppressed aggregate row for the probe's segment and domain (shift rows exist when the collective has shifts). */
function latestAggregate(db: SqlDatabase, r: Pick<ProbeRow, "collectiu_id" | "torn_id" | "domini_id">) {
  return one<{ score: number | null; confidence: number | null }>(
    db,
    `SELECT score, confidence FROM agregat
     WHERE collectiu_id = ? AND torn_id IS ? AND domini_id = ? AND suprimit = 0 ORDER BY periode DESC LIMIT 1`,
    r.collectiu_id,
    r.torn_id,
    r.domini_id,
  );
}

function status(r: ProbeRow, nowSql: string): ProbeStatus {
  if (r.stopped_at !== null) return "stopped";
  return nowSql < r.ends_at ? "active" : "expired";
}

function toView(r: ProbeRow, nowSql: string): ProbeView {
  const st = status(r, nowSql);
  const progress: ProbeProgress | null =
    r.progress_at === null
      ? null
      : {
          suppressed: r.suprimit === 1,
          answers: r.answers_n,
          answersBefore: r.answers_before_n,
          extraAnswers: r.answers_n !== null && r.answers_before_n !== null ? r.answers_n - r.answers_before_n : null,
          people: r.respondents_n,
          confidenceBefore: r.suprimit === 1 ? null : r.baseline_confidence,
          confidenceNow: r.confidence_now,
          scoreBefore: r.suprimit === 1 ? null : r.baseline_score,
          scoreNow: r.score_now,
          updatedAt: r.progress_at,
        };
  return {
    id: r.id,
    senyalId: r.senyal_id,
    collectiuId: r.collectiu_id,
    tornId: r.torn_id,
    dominiId: r.domini_id,
    boost: r.boost,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    stoppedAt: r.stopped_at,
    status: st,
    daysLeft: st === "active" ? Math.ceil((toMs(r.ends_at) - toMs(nowSql)) / DAY_MS) : 0,
    progress,
  };
}

const getRow = (db: SqlDatabase, id: number) => one<ProbeRow>(db, "SELECT * FROM probe WHERE id = ?", id);

/**
 * Starts a probe. Refuses segments under the minimum group size, a second active probe on the same segment and
 * domain, and out-of-range boost or days. The segment is a collective (optionally one shift): never an account.
 */
export function startProbe(db: SqlDatabase, input: StartProbeInput, config?: Partial<EngineConfig>): ProbeView {
  const cfg = resolveConfig(db, config);
  const boost = input.boost ?? 2;
  const days = input.days ?? 14;
  const tornId = input.tornId ?? null;
  const nowMs = input.now ?? Date.now();
  if (!(boost > 1 && boost <= MAX_PROBE_BOOST)) throw new ProbeError(`boost must be above 1 and at most ${MAX_PROBE_BOOST}`);
  if (!(days > 0 && days <= MAX_PROBE_DAYS)) throw new ProbeError(`days must be above 0 and at most ${MAX_PROBE_DAYS}`);
  if (!one(db, "SELECT 1 FROM collectiu WHERE id = ?", input.collectiuId)) throw new ProbeError("unknown collective");
  if (!one(db, "SELECT 1 FROM domini WHERE id = ?", input.dominiId)) throw new ProbeError("unknown domain");
  if (tornId !== null && !one(db, "SELECT 1 FROM torn WHERE id = ?", tornId)) throw new ProbeError("unknown shift");
  if (input.senyalId != null && !one(db, "SELECT 1 FROM senyal WHERE id = ?", input.senyalId)) throw new ProbeError("unknown signal");

  const size = segmentSize(db, input.collectiuId, tornId);
  if (size < cfg.minGroupSize) throw new ProbeError(`segment has ${size} people, under the minimum group size of ${cfg.minGroupSize}`);

  const startsAt = toSqlDatetime(nowMs);
  const dup = one<{ id: number }>(
    db,
    `SELECT id FROM probe WHERE collectiu_id = ? AND torn_id IS ? AND domini_id = ? AND stopped_at IS NULL AND ends_at > ?`,
    input.collectiuId,
    tornId,
    input.dominiId,
    startsAt,
  );
  if (dup) throw new ProbeError(`probe ${dup.id} is already active on this segment and domain; stop it first`);

  const base = latestAggregate(db, { collectiu_id: input.collectiuId, torn_id: tornId, domini_id: input.dominiId });
  const res = run(
    db,
    `INSERT INTO probe (senyal_id, collectiu_id, torn_id, domini_id, boost, starts_at, ends_at, baseline_confidence, baseline_score)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    input.senyalId ?? null,
    input.collectiuId,
    tornId,
    input.dominiId,
    boost,
    startsAt,
    toSqlDatetime(nowMs + days * DAY_MS),
    base?.confidence ?? null,
    base?.score ?? null,
  );
  return toView(getRow(db, Number(res.lastInsertRowid))!, startsAt);
}

export interface ListProbesQuery {
  senyalId?: number;
  collectiuId?: number;
  status?: ProbeStatus;
  now?: number;
}

/** Newest first. */
export function listProbes(db: SqlDatabase, q: ListProbesQuery = {}): ProbeView[] {
  const nowSql = toSqlDatetime(q.now ?? Date.now());
  const rows = all<ProbeRow>(db, "SELECT * FROM probe ORDER BY id DESC");
  return rows
    .filter((r) => (q.senyalId === undefined || r.senyal_id === q.senyalId) && (q.collectiuId === undefined || r.collectiu_id === q.collectiuId))
    .map((r) => toView(r, nowSql))
    .filter((v) => q.status === undefined || v.status === q.status);
}

/** Ends a probe now. Its progress stays readable. Stopping a stopped or expired probe changes nothing. */
export function stopProbe(db: SqlDatabase, id: number, now: number = Date.now()): ProbeView {
  const nowSql = toSqlDatetime(now);
  const r = getRow(db, id);
  if (!r) throw new ProbeError("unknown probe");
  if (r.stopped_at === null && nowSql < r.ends_at) run(db, "UPDATE probe SET stopped_at = ? WHERE id = ?", nowSql, id);
  return toView(getRow(db, id)!, nowSql);
}

/** Active boosts for one account's segment: domain id -> boost (the largest when several probes match). Scheduler-side. */
export function activeProbeBoosts(db: SqlDatabase, collectiuId: number, tornId: number | null, nowMs: number): Map<number, number> {
  const rows = all<{ domini_id: number; boost: number }>(
    db,
    `SELECT domini_id, boost FROM probe
     WHERE collectiu_id = ? AND (torn_id IS NULL OR torn_id IS ?) AND stopped_at IS NULL AND starts_at <= ? AND ends_at > ?`,
    collectiuId,
    tornId,
    toSqlDatetime(nowMs),
    toSqlDatetime(nowMs),
  );
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.domini_id, Math.max(m.get(r.domini_id) ?? 1, r.boost));
  return m;
}

/**
 * Engine job step: refreshes every probe's progress from the answers since it started and the latest aggregate.
 * Aggregate output only; below the minimum group size the numbers are hidden (suprimit = 1).
 */
export function updateProbeProgress(db: SqlDatabase, nowMs: number, config?: Partial<EngineConfig>): number {
  const cfg = resolveConfig(db, config);
  const nowSql = toSqlDatetime(nowMs);
  const rows = all<ProbeRow>(db, "SELECT * FROM probe WHERE starts_at <= ?", nowSql);
  const count = (r: ProbeRow, from: string, to: string) =>
    one<{ a: number; p: number }>(
      db,
      `SELECT COUNT(*) AS a, COUNT(DISTINCT x.compte_id) AS p
       FROM resposta x JOIN pregunta q ON q.id = x.pregunta_id JOIN compte c ON c.id = x.compte_id
       WHERE q.domini_id = ? AND c.collectiu_id = ? AND (? IS NULL OR c.torn_id = ?) AND x.data >= ? AND x.data < ?`,
      r.domini_id,
      r.collectiu_id,
      r.torn_id,
      r.torn_id,
      from,
      to,
    ) ?? { a: 0, p: 0 };
  for (const r of rows) {
    // A finished probe stops counting at its end, so its numbers freeze.
    const end = [nowSql, r.ends_at, r.stopped_at ?? nowSql].reduce((a, b) => (a < b ? a : b));
    const lengthMs = toMs(end) - toMs(r.starts_at);
    const beforeFrom = toSqlDatetime(toMs(r.starts_at) - lengthMs);
    const during = count(r, r.starts_at, end);
    const before = count(r, beforeFrom, r.starts_at);
    const hide = during.p < cfg.minGroupSize;
    const agg = hide ? undefined : latestAggregate(db, r);
    run(
      db,
      `UPDATE probe SET progress_at = ?, suprimit = ?, answers_n = ?, answers_before_n = ?, respondents_n = ?, confidence_now = ?, score_now = ? WHERE id = ?`,
      nowSql,
      hide ? 1 : 0,
      hide ? null : during.a,
      hide || before.p < cfg.minGroupSize ? null : before.a,
      hide ? null : during.p,
      agg?.confidence ?? null,
      agg?.score ?? null,
      r.id,
    );
  }
  return rows.length;
}
