// Question pool inspector for the HR dashboard: every question with its delivery statistics, status and schedule.
// Aggregates only. Per-account rows are counted, never returned; content statistics (mean score, comment
// counts, response time) are suppressed under the minimum group size like everywhere else.
import { QUESTION_TYPES, type QuestionType } from "@damm/shared";
import { resolveConfig, type EngineConfig } from "./config.ts";
import { all, one, run, type SqlDatabase } from "./db.ts";
import { addDays, dayOf } from "./time.ts";

export type PoolState = "live" | "waiting" | "inactive";
/** Why a question is, or is not, in the rotation. */
export type PoolReason =
  | "live" // approved monitoring item or approved item of a published need
  | "need_done" // published-need question every eligible person has already answered
  | "followup_only" // follow-up wording: only asked when a trajectory follow-up is due
  | "draft" // waiting for human approval
  | "need_unpublished" // approved, but its need is not published yet
  | "need_closed" // its need was closed
  | "retired"; // retired by a human or discarded draft

export interface PoolByCollective {
  collectiuId: number;
  collective: string;
  asked: number;
  responses: number;
  /** null when fewer than the minimum group size answered. */
  avgScore: number | null;
}

export interface PoolQuestion {
  id: number;
  text: string;
  type: QuestionType;
  domainId: number;
  domain: string;
  /** null = every collective. */
  collectiuId: number | null;
  collective: string;
  facet: string | null;
  polarity: 1 | -1;
  options: { label: string; score?: number; domain_id?: number }[] | null;
  isFollowup: boolean;
  aiGenerated: boolean;
  /** Reason the AI gave when drafting (HR need questions). */
  aiReason: string | null;
  priority: number;
  order: number;
  approvedBy: string | null;
  approvedAt: string | null;
  /** DB value: draft | aprovada | retirada. */
  dbStatus: string;
  needId: number | null;
  needTitle: string | null;
  needStatus: string | null;

  // Schedule
  state: PoolState;
  reason: PoolReason;
  /** Day (YYYY-MM-DD) of the next daily batch that can include it, null when not in the rotation. */
  nextBatchDay: string | null;
  /** People in the target collective(s) with an account. Count only. */
  eligibleAccounts: number;
  /** Distinct accounts that answered it. Count only. */
  reachedAccounts: number;
  /** Eligible accounts that still have to answer (need questions are asked once per person). */
  pendingAccounts: number | null;
  /** Average assignments per day over the last 14 days. */
  askedPerDay14: number;
  inTodayBatches: number;

  // Delivery
  asked: number;
  askedByReason: { monitor: number; need: number; followup: number };
  /** Assignments that were answered. */
  answeredAssigned: number;
  /** Answers stored. Can exceed `answeredAssigned` for answers imported without an assignment (seed). */
  responses: number;
  /** answeredAssigned / asked, null when never assigned. */
  answerRate: number | null;
  asked7d: number;
  responses7d: number;
  firstAskedDay: string | null;
  lastAskedDay: string | null;
  lastAnsweredAt: string | null;

  // Content statistics, null under the minimum group size
  avgScore: number | null;
  avgAnswerMs: number | null;
  carelessShare: number | null;
  comments: number | null;

  byCollective: PoolByCollective[];
  byPeriod: { periode: string; responses: number }[];
}

export interface PoolSummary {
  today: string;
  timezone: string;
  questionsPerDay: number;
  itemCooldownDays: number;
  maxNeedsPerDay: number;
  minGroupSize: number;
  accounts: number;
  counts: Record<PoolState, number> & { total: number };
  asked: number;
  responses: number;
  answerRate: number | null;
  asked7d: number;
  responses7d: number;
  byType: { type: string; questions: number; live: number; asked: number; responses: number }[];
}

export interface Pool {
  summary: PoolSummary;
  questions: PoolQuestion[];
}

interface Row {
  id: number;
  text: string;
  tipus: QuestionType;
  domini_id: number;
  domain: string;
  collectiu_id: number | null;
  collective: string | null;
  facet: string | null;
  polarity: number;
  options_json: string | null;
  is_followup: number;
  generada_per_ia: number;
  motiu: string | null;
  prioritat: number;
  ordre: number;
  aprovada_per: string | null;
  aprovada_el: string | null;
  estat: string;
  necessitat_id: number | null;
  need_title: string | null;
  need_text: string | null;
  need_estat: string | null;
  need_collectiu: number | null;
}

function parseOptions(json: string | null): PoolQuestion["options"] {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as PoolQuestion["options"]) : null;
  } catch {
    return null;
  }
}

export function classify(r: Pick<Row, "estat" | "is_followup" | "necessitat_id" | "need_estat">, needDone: boolean): { state: PoolState; reason: PoolReason } {
  if (r.estat === "retirada") return { state: "inactive", reason: "retired" };
  if (r.estat === "draft") return { state: "inactive", reason: "draft" };
  if (r.necessitat_id !== null) {
    if (r.need_estat === "tancada") return { state: "inactive", reason: "need_closed" };
    if (r.need_estat !== "publicada") return { state: "waiting", reason: "need_unpublished" };
  }
  if (r.is_followup) return { state: "waiting", reason: "followup_only" };
  if (r.necessitat_id !== null && needDone) return { state: "waiting", reason: "need_done" };
  return { state: "live", reason: "live" };
}

/** Everything the dashboard shows about the question bank. `config` overrides engine_config (tests). */
export function listPool(db: SqlDatabase, opts: { now?: number; config?: Partial<EngineConfig> } = {}): Pool {
  const cfg = resolveConfig(db, opts.config);
  const nowMs = opts.now ?? Date.now();
  const today = dayOf(nowMs, cfg.timezone);
  const d7 = addDays(today, -6);
  const d14 = addDays(today, -13);
  const sql7 = `${d7} 00:00:00`;

  const rows = all<Row>(
    db,
    `SELECT p.id, p.text, p.tipus, p.domini_id, d.nom AS domain, p.collectiu_id, c.nom AS collective, p.facet, p.polarity,
            p.options_json, p.is_followup, p.generada_per_ia, p.motiu, p.prioritat, p.ordre, p.aprovada_per, p.aprovada_el, p.estat,
            p.necessitat_id, n.titol AS need_title, n.text_nl AS need_text, n.estat AS need_estat, n.collectiu_id AS need_collectiu
       FROM pregunta p
       JOIN domini d ON d.id = p.domini_id
  LEFT JOIN collectiu c ON c.id = p.collectiu_id
  LEFT JOIN necessitat n ON n.id = p.necessitat_id
   ORDER BY p.id`,
  );

  const accountsBy = new Map(all<{ c: number; n: number }>(db, "SELECT collectiu_id AS c, COUNT(*) AS n FROM compte GROUP BY collectiu_id").map((r) => [r.c, r.n]));
  const totalAccounts = [...accountsBy.values()].reduce((a, b) => a + b, 0);
  const collectives = new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM collectiu").map((r) => [r.id, r.nom]));

  // Delivery per question, from the daily batches.
  type Del = { asked: number; answered: number; monitor: number; need: number; followup: number; first: string | null; last: string | null; a7: number; a14: number; today: number };
  const delivery = new Map(
    all<{ q: number } & Record<string, number | string | null>>(
      db,
      `SELECT pregunta_id AS q, COUNT(*) AS asked, SUM(answered_at IS NOT NULL) AS answered,
              SUM(reason = 'monitor') AS monitor, SUM(reason = 'need') AS need, SUM(reason = 'followup') AS followup,
              MIN(day) AS first, MAX(day) AS last,
              SUM(day >= ?) AS a7, SUM(day >= ?) AS a14, SUM(day = ?) AS today
         FROM assignment GROUP BY pregunta_id`,
      d7,
      d14,
      today,
    ).map((r) => [r.q as number, r as unknown as Del]),
  );

  // Answers per question.
  type Ans = { n: number; reached: number; last: string | null; n7: number; avgScore: number | null; avgMs: number | null; careless: number; withMs: number; comments: number };
  const answers = new Map(
    all<{ q: number } & Record<string, number | string | null>>(
      db,
      `SELECT pregunta_id AS q, COUNT(*) AS n, COUNT(DISTINCT compte_id) AS reached, MAX(data) AS last, SUM(data >= ?) AS n7,
              AVG(score) AS avgScore, AVG(answer_ms) AS avgMs, SUM(answer_ms IS NOT NULL AND answer_ms < ?) AS careless,
              SUM(answer_ms IS NOT NULL) AS withMs, SUM(comentari IS NOT NULL AND comentari <> '') AS comments
         FROM resposta GROUP BY pregunta_id`,
      sql7,
      cfg.minAnswerMs,
    ).map((r) => [r.q as number, r as unknown as Ans]),
  );

  const byCol = new Map<number, PoolByCollective[]>();
  const askedByCol = new Map<string, number>(
    all<{ q: number; c: number; n: number }>(
      db,
      `SELECT a.pregunta_id AS q, c.collectiu_id AS c, COUNT(*) AS n FROM assignment a JOIN compte c ON c.id = a.compte_id GROUP BY a.pregunta_id, c.collectiu_id`,
    ).map((r) => [`${r.q}|${r.c}`, r.n]),
  );
  const ansCols = all<{ q: number; c: number; n: number; avg: number | null }>(
    db,
    `SELECT r.pregunta_id AS q, c.collectiu_id AS c, COUNT(*) AS n, AVG(r.score) AS avg FROM resposta r JOIN compte c ON c.id = r.compte_id GROUP BY r.pregunta_id, c.collectiu_id`,
  );
  const seenKeys = new Set<string>();
  for (const r of ansCols) {
    seenKeys.add(`${r.q}|${r.c}`);
    (byCol.get(r.q) ?? byCol.set(r.q, []).get(r.q)!).push({
      collectiuId: r.c,
      collective: collectives.get(r.c) ?? `#${r.c}`,
      asked: askedByCol.get(`${r.q}|${r.c}`) ?? 0,
      responses: r.n,
      avgScore: r.n >= cfg.minGroupSize && r.avg !== null ? r.avg : null,
    });
  }
  for (const [k, n] of askedByCol) {
    if (seenKeys.has(k)) continue;
    const [q, c] = k.split("|").map(Number) as [number, number];
    (byCol.get(q) ?? byCol.set(q, []).get(q)!).push({ collectiuId: c, collective: collectives.get(c) ?? `#${c}`, asked: n, responses: 0, avgScore: null });
  }

  const byPeriod = new Map<number, { periode: string; responses: number }[]>();
  for (const r of all<{ q: number; p: string; n: number }>(db, "SELECT pregunta_id AS q, periode AS p, COUNT(*) AS n FROM resposta GROUP BY pregunta_id, periode ORDER BY periode")) {
    (byPeriod.get(r.q) ?? byPeriod.set(r.q, []).get(r.q)!).push({ periode: r.p, responses: r.n });
  }

  const questions: PoolQuestion[] = rows.map((r) => {
    const del = delivery.get(r.id);
    const ans = answers.get(r.id);
    const collectiuId = r.collectiu_id ?? r.need_collectiu;
    const eligible = collectiuId === null ? totalAccounts : accountsBy.get(collectiuId) ?? 0;
    const reached = ans?.reached ?? 0;
    const needDone = r.necessitat_id !== null && eligible > 0 && reached >= eligible;
    const { state, reason } = classify(r, needDone);
    const asked = del?.asked ?? 0;
    const responses = ans?.n ?? 0;
    const enough = responses >= cfg.minGroupSize;
    return {
      id: r.id,
      text: r.text,
      type: r.tipus,
      domainId: r.domini_id,
      domain: r.domain,
      collectiuId: r.collectiu_id,
      collective: r.collective ?? (r.necessitat_id !== null && r.need_collectiu !== null ? collectives.get(r.need_collectiu) ?? "Tots" : "Tots"),
      facet: r.facet,
      polarity: r.polarity === -1 ? -1 : 1,
      options: parseOptions(r.options_json),
      isFollowup: r.is_followup === 1,
      aiGenerated: r.generada_per_ia === 1,
      aiReason: r.motiu,
      priority: r.prioritat,
      order: r.ordre,
      approvedBy: r.aprovada_per,
      approvedAt: r.aprovada_el,
      dbStatus: r.estat,
      needId: r.necessitat_id,
      needTitle: r.necessitat_id === null ? null : r.need_title ?? r.need_text,
      needStatus: r.need_estat,
      state,
      reason,
      nextBatchDay: state === "live" ? addDays(today, 1) : null,
      eligibleAccounts: eligible,
      reachedAccounts: reached,
      pendingAccounts: r.necessitat_id !== null ? Math.max(0, eligible - reached) : null,
      askedPerDay14: del ? Math.round((del.a14 / 14) * 10) / 10 : 0,
      inTodayBatches: del?.today ?? 0,
      asked,
      askedByReason: { monitor: del?.monitor ?? 0, need: del?.need ?? 0, followup: del?.followup ?? 0 },
      answeredAssigned: del?.answered ?? 0,
      responses,
      answerRate: asked > 0 ? (del?.answered ?? 0) / asked : null,
      asked7d: del?.a7 ?? 0,
      responses7d: ans?.n7 ?? 0,
      firstAskedDay: del?.first ?? null,
      lastAskedDay: del?.last ?? null,
      lastAnsweredAt: ans?.last ?? null,
      avgScore: enough ? ans?.avgScore ?? null : null,
      avgAnswerMs: enough && ans?.avgMs != null ? Math.round(ans.avgMs) : null,
      carelessShare: enough && ans && ans.withMs > 0 ? ans.careless / ans.withMs : null,
      comments: enough ? ans?.comments ?? 0 : null,
      byCollective: (byCol.get(r.id) ?? []).sort((a, b) => a.collectiuId - b.collectiuId),
      byPeriod: byPeriod.get(r.id) ?? [],
    };
  });

  const sum = (f: (q: PoolQuestion) => number) => questions.reduce((s, q) => s + f(q), 0);
  const asked = sum((q) => q.asked);
  const answeredAssigned = sum((q) => q.answeredAssigned);
  const summary: PoolSummary = {
    today,
    timezone: cfg.timezone,
    questionsPerDay: cfg.questionsPerDay,
    itemCooldownDays: cfg.itemCooldownDays,
    maxNeedsPerDay: cfg.maxNeedsPerDay,
    minGroupSize: cfg.minGroupSize,
    accounts: totalAccounts,
    counts: {
      total: questions.length,
      live: questions.filter((q) => q.state === "live").length,
      waiting: questions.filter((q) => q.state === "waiting").length,
      inactive: questions.filter((q) => q.state === "inactive").length,
    },
    asked,
    responses: sum((q) => q.responses),
    answerRate: asked > 0 ? answeredAssigned / asked : null,
    asked7d: sum((q) => q.asked7d),
    responses7d: sum((q) => q.responses7d),
    byType: QUESTION_TYPES.map((type) => {
      const qs = questions.filter((q) => q.type === type);
      return { type, questions: qs.length, live: qs.filter((q) => q.state === "live").length, asked: qs.reduce((s, q) => s + q.asked, 0), responses: qs.reduce((s, q) => s + q.responses, 0) };
    }),
  };
  return { summary, questions };
}

export type SetPoolStatusResult = { ok: true } | { ok: false; error: "not_found" | "not_approved_before" | "already" | "draft" };

/**
 * Human pool control. Retire: an approved question leaves the rotation (history is kept).
 * Reactivate: only a question that was approved or used before comes back; a discarded draft needs the normal review.
 */
export function setQuestionActive(db: SqlDatabase, id: number, active: boolean, by: string): SetPoolStatusResult {
  const q = one<{ estat: string; aprovada_el: string | null; used: number }>(
    db,
    `SELECT estat, aprovada_el, (EXISTS (SELECT 1 FROM assignment WHERE pregunta_id = pregunta.id) OR EXISTS (SELECT 1 FROM resposta WHERE pregunta_id = pregunta.id)) AS used
       FROM pregunta WHERE id = ?`,
    id,
  );
  if (!q) return { ok: false, error: "not_found" };
  if (q.estat === "draft") return { ok: false, error: "draft" };
  if (active) {
    if (q.estat === "aprovada") return { ok: false, error: "already" };
    if (q.aprovada_el === null && !q.used) return { ok: false, error: "not_approved_before" };
    run(db, "UPDATE pregunta SET estat = 'aprovada', aprovada_per = ?, aprovada_el = datetime('now') WHERE id = ?", by, id);
  } else {
    if (q.estat === "retirada") return { ok: false, error: "already" };
    run(db, "UPDATE pregunta SET estat = 'retirada' WHERE id = ?", id);
  }
  return { ok: true };
}

// --- one question, in depth ---------------------------------------------------------------------

export interface PoolWeek {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  asked: number;
  answeredAssigned: number;
  responses: number;
  /** 0..1, null under the minimum group size. */
  avgScore: number | null;
}

export interface PoolSegment {
  collective: string;
  /** null = no shift. */
  shift: string | null;
  responses: number;
  /** null under the minimum group size. */
  avgScore: number | null;
  suppressed: boolean;
}

export interface PoolDistributionBar {
  label: string;
  count: number;
}

export interface PoolPeriodScore {
  periode: string;
  responses: number;
  avgScore: number | null;
}

export interface PoolQuestionDetail {
  question: PoolQuestion;
  weekly: PoolWeek[];
  /** Answer distribution; null for open questions or under the minimum group size. */
  distribution: { kind: "values" | "options" | "ranking"; bars: PoolDistributionBar[]; note?: string } | null;
  periods: PoolPeriodScore[];
  segments: PoolSegment[];
  /** Learned item baseline from item_stats (no account data). */
  itemBias: { bias: number; n: number } | null;
}

const WEEK = (col: string) => `date(${col}, 'weekday 0', '-6 days')`;

export function getPoolQuestion(db: SqlDatabase, id: number, opts: { now?: number; config?: Partial<EngineConfig> } = {}): PoolQuestionDetail | null {
  const cfg = resolveConfig(db, opts.config);
  const question = listPool(db, opts).questions.find((q) => q.id === id);
  if (!question) return null;
  const min = cfg.minGroupSize;

  const weeks = new Map<string, PoolWeek>();
  const week = (w: string) => weeks.get(w) ?? weeks.set(w, { week: w, asked: 0, answeredAssigned: 0, responses: 0, avgScore: null }).get(w)!;
  for (const r of all<{ w: string; asked: number; answered: number }>(
    db,
    `SELECT ${WEEK("day")} AS w, COUNT(*) AS asked, SUM(answered_at IS NOT NULL) AS answered FROM assignment WHERE pregunta_id = ? GROUP BY w`,
    id,
  )) {
    const x = week(r.w);
    x.asked = r.asked;
    x.answeredAssigned = r.answered;
  }
  for (const r of all<{ w: string; n: number; avg: number | null }>(
    db,
    `SELECT ${WEEK("data")} AS w, COUNT(*) AS n, AVG(score) AS avg FROM resposta WHERE pregunta_id = ? GROUP BY w`,
    id,
  )) {
    const x = week(r.w);
    x.responses = r.n;
    x.avgScore = r.n >= min ? r.avg : null;
  }

  const periods = all<{ p: string; n: number; avg: number | null }>(
    db,
    "SELECT periode AS p, COUNT(*) AS n, AVG(score) AS avg FROM resposta WHERE pregunta_id = ? GROUP BY periode ORDER BY periode",
    id,
  ).map((r) => ({ periode: r.p, responses: r.n, avgScore: r.n >= min ? r.avg : null }));

  const segments = all<{ c: string; t: string | null; n: number; avg: number | null }>(
    db,
    `SELECT co.nom AS c, t.nom AS t, COUNT(*) AS n, AVG(r.score) AS avg
       FROM resposta r JOIN compte a ON a.id = r.compte_id JOIN collectiu co ON co.id = a.collectiu_id LEFT JOIN torn t ON t.id = a.torn_id
      WHERE r.pregunta_id = ? GROUP BY a.collectiu_id, a.torn_id ORDER BY co.nom, t.nom`,
    id,
  ).map((r) => ({ collective: r.c, shift: r.t, responses: r.n, avgScore: r.n >= min ? r.avg : null, suppressed: r.n < min }));

  let distribution: PoolQuestionDetail["distribution"] = null;
  if (question.responses >= min && question.type !== "open") {
    if (question.type === "ranking") {
      const sums = new Map<number, { total: number; n: number }>();
      for (const r of all<{ v: string | null }>(db, "SELECT value_json AS v FROM resposta WHERE pregunta_id = ? AND value_json IS NOT NULL", id)) {
        try {
          (JSON.parse(r.v!) as number[]).forEach((opt, pos) => {
            const s = sums.get(opt) ?? { total: 0, n: 0 };
            s.total += pos + 1;
            s.n++;
            sums.set(opt, s);
          });
        } catch {
          /* skip malformed */
        }
      }
      const opts = question.options ?? [];
      distribution = {
        kind: "ranking",
        note: "Posició mitjana (1 = primer)",
        bars: opts.map((o, i) => ({ label: o.label, count: sums.get(i) ? Math.round((sums.get(i)!.total / sums.get(i)!.n) * 100) / 100 : 0 })),
      };
    } else {
      const counts = new Map(all<{ v: number; n: number }>(db, "SELECT valor_num AS v, COUNT(*) AS n FROM resposta WHERE pregunta_id = ? AND valor_num IS NOT NULL GROUP BY valor_num", id).map((r) => [r.v, r.n]));
      if (question.type === "pair" || question.type === "choice") {
        distribution = { kind: "options", bars: (question.options ?? []).map((o, i) => ({ label: o.label, count: counts.get(i) ?? 0 })) };
      } else if (question.type === "yes_no") {
        distribution = { kind: "values", bars: [{ label: "No", count: counts.get(0) ?? 0 }, { label: "Sí", count: counts.get(1) ?? 0 }] };
      } else {
        const [lo, hi] = question.type === "scale5" ? [1, 5] : [0, 10];
        distribution = { kind: "values", bars: Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: String(lo + i), count: counts.get(lo + i) ?? 0 })) };
      }
    }
  }

  const bias = one<{ bias: number; n: number }>(db, "SELECT bias, n FROM item_stats WHERE pregunta_id = ?", id);
  return {
    question,
    weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    distribution,
    periods,
    segments,
    itemBias: bias ?? null,
  };
}
