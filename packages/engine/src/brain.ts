// The engine's "brain" for the HR dashboard: every number the daily batch is built from, plus a what-if
// simulator. Aggregates only: the signals come from collective-level statistics, and the simulator plays
// hypothetical people with no history, so no account is ever read or returned. Collectives with fewer
// accounts than the minimum group size are suppressed (signals hidden, neutral signals in the simulator).
import { QUESTION_TYPES, type AssignmentReason, type QuestionType } from "@damm/shared";
import { domainPriority, selectBatch, type DomainSignal } from "./batch.ts";
import { describeConfig, parseConfigPatch, resolveConfig, ENGINE_VERSION, type ConfigEntry } from "./config.ts";
import { one, type SqlDatabase } from "./db.ts";
import type { QuestionDef } from "./normalize.ts";
import { createRng } from "./rng.ts";
import { collectiveDomainStats, type DomainStats } from "./signals.ts";
import * as store from "./store.ts";
import { addDays, dayOf, toSqlDatetime } from "./time.ts";

export type WeightSource = "collective" | "default" | "none";

export interface BrainDomain {
  domainId: number;
  name: string;
  /** Effective HR weight and where it comes from. */
  weight: number;
  weightSource: WeightSource;
  /** Active "Indagar" multiplier (1 = none). */
  probeBoost: number;
  /** Final priority used to draw domains for a batch. */
  priority: number;
  /** Chance this domain is drawn first for a monitoring slot (priority share). */
  drawShare: number;
  /** Statistics from the collective's people; null while the collective is suppressed. */
  stats: Pick<DomainStats, "infoGain" | "outlierShare" | "people" | "score" | "confidence" | "consensus" | "recent"> | null;
  /** Approved monitoring questions in this domain for the collective. */
  questions: number;
}

export interface BrainFormatArm {
  tornId: number;
  shift: string;
  alpha: number;
  beta: number;
  /** Posterior mean of "careful answer" for the format. */
  mean: number;
  /** Answers observed beyond the prior. */
  observations: number;
}

export interface BrainFormat {
  type: QuestionType;
  preference: number;
  preferenceSource: WeightSource;
  questions: number;
  arms: BrainFormatArm[];
}

export interface BrainCollective {
  id: number;
  name: string;
  accounts: number;
  /** Fewer accounts than the minimum group size: statistics are hidden. */
  suppressed: boolean;
  pendingFollowups: number | null;
  /** Approved questions this collective can be served (monitoring, follow-up wording and published needs). */
  pool: { monitoring: number; followup: number; needs: number };
  domains: BrainDomain[];
  formats: BrainFormat[];
}

export interface BrainProbe {
  id: number;
  collectiuId: number;
  collective: string;
  tornId: number | null;
  shift: string | null;
  dominiId: number;
  domain: string;
  boost: number;
  endsAt: string;
}

export interface Brain {
  version: string;
  now: string;
  day: string;
  timezone: string;
  lastJobAt: string | null;
  minGroupSize: number;
  config: ConfigEntry[];
  domains: { id: number; name: string }[];
  shifts: { id: number; name: string }[];
  collectives: BrainCollective[];
  probes: BrainProbe[];
}

const sourceOf = <K>(rows: { collectiuId: number | null; k: K }[], collectiuId: number, k: K): WeightSource =>
  rows.some((r) => r.collectiuId === collectiuId && r.k === k) ? "collective" : rows.some((r) => r.collectiuId === null && r.k === k) ? "default" : "none";

function lastJobAt(db: SqlDatabase): string | null {
  const row = one<{ value: string }>(db, "SELECT value FROM engine_config WHERE key = 'last_job_at'");
  if (!row) return null;
  try {
    return String(JSON.parse(row.value));
  } catch {
    return row.value;
  }
}

export function getBrain(db: SqlDatabase, opts: { now?: number } = {}): Brain {
  const nowMs = opts.now ?? Date.now();
  const cfg = resolveConfig(db);
  const domains = store.domainNames(db).map((d) => ({ id: d.id, name: d.nom }));
  const shifts = store.shiftNames(db).map((s) => ({ id: s.id, name: s.nom }));
  const collectiveRows = store.collectiveNames(db);
  const weightRows = store.domainWeightRows(db).map((r) => ({ collectiuId: r.collectiuId, k: r.dominiId }));
  const prefRows = store.formatPreferenceRows(db).map((r) => ({ collectiuId: r.collectiuId, k: r.type }));
  const nowSql = toSqlDatetime(nowMs);
  const collName = new Map(collectiveRows.map((c) => [c.id, c.nom]));
  const domName = new Map(domains.map((d) => [d.id, d.name]));
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));
  const activeProbes = store.activeProbeRows(db, nowSql);

  const collectives: BrainCollective[] = collectiveRows.map((c) => {
    const accounts = store.accountCount(db, c.id);
    const suppressed = accounts < cfg.minGroupSize;
    const stats = suppressed ? null : collectiveDomainStats(db, cfg, c.id, nowMs);
    const weight = store.domainWeights(db, c.id);
    const pref = store.formatPrefs(db, c.id);
    const questions = store.approvedQuestionsFor(db, c.id);
    const monitoring = questions.filter((q) => q.needId === null && !q.isFollowup);
    const probes = new Map<number, number>();
    for (const p of activeProbes) if (p.collectiuId === c.id) probes.set(p.dominiId, Math.max(probes.get(p.dominiId) ?? 1, p.boost));

    const signals: DomainSignal[] = domains.map((d) => {
      const s = stats?.find((x) => x.domainId === d.id);
      return { domainId: d.id, infoGain: s?.infoGain ?? 0, outlierShare: s?.outlierShare ?? 0, weight: weight(d.id), probeBoost: probes.get(d.id) ?? 1 };
    });
    const maxGain = Math.max(0, ...signals.map((s) => s.infoGain));
    const priorities = signals.map((s) => domainPriority(s, maxGain, cfg));
    const total = priorities.reduce((a, b) => a + b, 0) || 1;

    const arms = store.formatStatsRows(db, c.id);
    return {
      id: c.id,
      name: c.nom,
      accounts,
      suppressed,
      pendingFollowups: suppressed ? null : store.pendingFollowupCount(db, c.id),
      pool: { monitoring: monitoring.length, followup: questions.filter((q) => q.isFollowup).length, needs: questions.filter((q) => q.needId !== null && !q.isFollowup).length },
      domains: domains.map((d, i) => {
        const s = stats?.find((x) => x.domainId === d.id);
        return {
          domainId: d.id,
          name: d.name,
          weight: weight(d.id),
          weightSource: sourceOf(weightRows, c.id, d.id),
          probeBoost: probes.get(d.id) ?? 1,
          priority: priorities[i]!,
          drawShare: priorities[i]! / total,
          stats: s ? { infoGain: s.infoGain, outlierShare: s.outlierShare, people: s.people, score: s.score, confidence: s.confidence, consensus: s.consensus, recent: s.recent } : null,
          questions: monitoring.filter((q) => q.domainId === d.id).length,
        };
      }),
      formats: QUESTION_TYPES.map((type) => {
        const prior = cfg.priors.formatBeta[type] ?? [1, 1];
        return {
          type,
          preference: pref(type),
          preferenceSource: sourceOf(prefRows, c.id, type),
          questions: questions.filter((q) => q.type === type).length,
          arms: arms
            .filter((a) => a.type === type)
            .map((a) => ({
              tornId: a.tornId,
              shift: a.tornId ? (shiftName.get(a.tornId) ?? String(a.tornId)) : "sense torn",
              alpha: a.alpha,
              beta: a.beta,
              mean: a.alpha / (a.alpha + a.beta),
              observations: Math.max(0, a.alpha + a.beta - prior[0] - prior[1]),
            })),
        };
      }),
    };
  });

  return {
    version: ENGINE_VERSION,
    now: nowSql,
    day: dayOf(nowMs, cfg.timezone),
    timezone: cfg.timezone,
    lastJobAt: lastJobAt(db),
    minGroupSize: cfg.minGroupSize,
    config: describeConfig(db),
    domains,
    shifts,
    collectives,
    probes: activeProbes.map((p) => ({
      ...p,
      collective: collName.get(p.collectiuId) ?? String(p.collectiuId),
      shift: p.tornId ? (shiftName.get(p.tornId) ?? null) : null,
      domain: domName.get(p.dominiId) ?? String(p.dominiId),
    })),
  };
}

// --- what-if simulator ----------------------------------------------------------------------

export const MAX_SIM_DAYS = 28;
export const MAX_SIM_PEOPLE = 300;

export interface SimulateInput {
  collectiuId: number;
  tornId?: number | null;
  /** Days to play, 1..28. Default 14. */
  days?: number;
  /** Hypothetical people (fresh, no history), 1..300. Default 100. */
  people?: number;
  /** First simulated day (YYYY-MM-DD). Default today. */
  startDay?: string;
  /** Changes of any engine_config key (snake_case), as HR would set them. Nothing is stored. */
  config?: Record<string, unknown>;
  /** What-if domain weights (domain id → weight > 0) and format preferences (type → weight ≥ 0). */
  domainWeights?: Record<number, number>;
  formatPreferences?: Partial<Record<QuestionType, number>>;
  /** What-if "Indagar" multipliers per domain id. */
  probeBoosts?: Record<number, number>;
  seed?: string;
  now?: number;
}

export interface SimQueueItem {
  questionId: number;
  text: string;
  type: QuestionType;
  domainId: number;
  reason: AssignmentReason;
}

export interface SimResult {
  collectiuId: number;
  collective: string;
  startDay: string;
  days: number;
  people: number;
  /** Signals were hidden because the collective is under the minimum group size; the run used neutral ones. */
  neutralSignals: boolean;
  slotsPerDay: number;
  /** Share of all served questions, by domain / type / reason. */
  domainMix: { domainId: number; name: string; share: number }[];
  typeMix: { type: QuestionType; share: number }[];
  reasonMix: Record<AssignmentReason, number>;
  distinctQuestions: number;
  poolQuestions: number;
  /** Mean days between two showings of the same question to the same person (null if no repeats). */
  meanRepeatGapDays: number | null;
  /** Published-need questions: share of people who have been served each one by the end of each day. */
  needCoverage: { questionId: number; text: string; byDay: number[] }[];
  /** The most served questions: share of person-days that got it. */
  topQuestions: { questionId: number; text: string; type: QuestionType; domainId: number; share: number }[];
  /** Day-by-day batches of one hypothetical person. */
  queue: { day: string; items: SimQueueItem[] }[];
}

export function simulateBrain(db: SqlDatabase, input: SimulateInput): SimResult {
  const days = Math.min(MAX_SIM_DAYS, Math.max(1, Math.floor(input.days ?? 14)));
  const people = Math.min(MAX_SIM_PEOPLE, Math.max(1, Math.floor(input.people ?? 100)));
  const nowMs = input.now ?? Date.now();
  const collective = store.collectiveNames(db).find((c) => c.id === input.collectiuId);
  if (!collective) throw new RangeError("unknown collective");
  const tornId = input.tornId ?? null;
  const cfg = resolveConfig(db, parseConfigPatch(input.config ?? {}));
  const startDay = input.startDay ?? dayOf(nowMs, cfg.timezone);
  const seed = input.seed ?? "brain";
  const names = new Map(store.domainNames(db).map((d) => [d.id, d.nom]));

  const accounts = store.accountCount(db, collective.id);
  const neutral = accounts < cfg.minGroupSize;
  const stats = neutral ? [] : collectiveDomainStats(db, cfg, collective.id, nowMs);
  const weightOf = store.domainWeights(db, collective.id);
  const prefOf = store.formatPrefs(db, collective.id);
  const probes = new Map<number, number>();
  for (const p of store.activeProbeRows(db, toSqlDatetime(nowMs))) {
    if (p.collectiuId === collective.id && (p.tornId === null || p.tornId === tornId)) probes.set(p.dominiId, Math.max(probes.get(p.dominiId) ?? 1, p.boost));
  }
  for (const [d, b] of Object.entries(input.probeBoosts ?? {})) probes.set(Number(d), Math.max(1, Math.min(10, b)));
  for (const [d, w] of Object.entries(input.domainWeights ?? {})) if (!(w > 0)) throw new RangeError(`domain weight for ${d} must be > 0`);

  const domains: DomainSignal[] = store.domainIds(db).map((id) => {
    const s = stats.find((x) => x.domainId === id);
    return { domainId: id, infoGain: s?.infoGain ?? 0, outlierShare: s?.outlierShare ?? 0, weight: input.domainWeights?.[id] ?? weightOf(id), probeBoost: probes.get(id) ?? 1 };
  });
  const formatPref = (t: QuestionType) => input.formatPreferences?.[t] ?? prefOf(t);
  const formatStats = store.formatStatsFor(db, cfg, collective.id, tornId);
  const questions = store.approvedQuestionsFor(db, collective.id);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const needQs = questions.filter((q) => q.needId !== null && !q.isFollowup).sort((a, b) => b.priority - a.priority || a.id - b.id);

  const dayList = Array.from({ length: days }, (_, i) => addDays(startDay, i));
  const toItem = (q: QuestionDef, reason: AssignmentReason): SimQueueItem => ({ questionId: q.id, text: q.text, type: q.type, domainId: q.domainId, reason });

  const byDomain = new Map<number, number>();
  const byType = new Map<QuestionType, number>();
  const byReason: Record<AssignmentReason, number> = { monitor: 0, need: 0, followup: 0 };
  const served = new Map<number, number>();
  const needSeen = new Map<number, number[]>(needQs.map((q) => [q.id, Array<number>(days).fill(0)]));
  let total = 0;
  let gapSum = 0;
  let gapN = 0;
  const queue: { day: string; items: SimQueueItem[] }[] = dayList.map((day) => ({ day, items: [] }));

  for (let p = 0; p < people; p++) {
    const lastSeen = new Map<number, string>();
    const answered = new Set<number>();
    dayList.forEach((day, di) => {
      const picks = selectBatch({
        cfg, rng: createRng(`${seed}|${p}|${day}`), day, questions, lastSeen, answered,
        dueFollowups: [], domains, formatPref, formatStats,
      });
      // Same top-up as the live engine: published needs not yet answered are served beyond the daily cap.
      const inBatch = new Set(picks.map((x) => x.question.id));
      const batch: { question: QuestionDef; reason: AssignmentReason }[] = [...picks];
      for (const q of needQs) if (!answered.has(q.id) && !inBatch.has(q.id)) batch.push({ question: q, reason: "need" });
      for (const { question: q, reason } of batch) {
        const prev = lastSeen.get(q.id);
        if (prev) {
          gapSum += (Date.parse(day) - Date.parse(prev)) / 86_400_000;
          gapN++;
        }
        lastSeen.set(q.id, day);
        answered.add(q.id); // every simulated person answers everything: this measures the engine, not the people
        total++;
        byDomain.set(q.domainId, (byDomain.get(q.domainId) ?? 0) + 1);
        byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
        byReason[reason]++;
        served.set(q.id, (served.get(q.id) ?? 0) + 1);
        if (p === 0) queue[di]!.items.push(toItem(q, reason));
        const cov = needSeen.get(q.id);
        if (cov) for (let k = di; k < days; k++) cov[k]!++;
      }
    });
  }

  const share = (n: number) => (total ? n / total : 0);
  const personDays = people * days;
  return {
    collectiuId: collective.id,
    collective: collective.nom,
    startDay,
    days,
    people,
    neutralSignals: neutral,
    slotsPerDay: total / personDays,
    domainMix: store.domainIds(db).map((id) => ({ domainId: id, name: names.get(id) ?? String(id), share: share(byDomain.get(id) ?? 0) })),
    typeMix: QUESTION_TYPES.map((type) => ({ type, share: share(byType.get(type) ?? 0) })).filter((x) => x.share > 0),
    reasonMix: { monitor: share(byReason.monitor), need: share(byReason.need), followup: share(byReason.followup) },
    distinctQuestions: served.size,
    poolQuestions: questions.length,
    meanRepeatGapDays: gapN ? gapSum / gapN : null,
    needCoverage: needQs.map((q) => ({ questionId: q.id, text: q.text, byDay: needSeen.get(q.id)!.map((n) => n / people) })),
    topQuestions: [...served.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 12)
      .map(([id, n]) => ({ questionId: id, text: byId.get(id)!.text, type: byId.get(id)!.type, domainId: byId.get(id)!.domainId, share: n / personDays })),
    queue,
  };
}

/** Clears one weight or preference stored for a collective (null = the default row), so it falls back. */
export function clearDomainWeight(db: SqlDatabase, collectiuId: number | null, dominiId: number): void {
  store.clearDomainWeight(db, collectiuId, dominiId);
}
export function clearFormatPreference(db: SqlDatabase, collectiuId: number | null, type: QuestionType): void {
  store.clearFormatPreference(db, collectiuId, type);
}
