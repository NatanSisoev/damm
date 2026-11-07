// Engine job: replays all answers in time order and writes aggregate tables. docs/engine.md sections 4 and 11.
// Writes only aggregates (n >= minGroupSize or suppressed) plus, on a fresh database, the engine's own state.
import type { RankingOption } from "@damm/shared";
import { ENGINE_VERSION, resolveConfig, writeSystemKey, type EngineConfig } from "./config.ts";
import { all, one, run, transaction, type SqlDatabase } from "./db.ts";
import { EMPTY_ITEM, type ItemStats } from "./item-bias.ts";
import { isClosed, learn, priorLevel } from "./learn.ts";
import { bordaWeights, parseAnswer } from "./normalize.ts";
import type { PersonDomainState } from "./person.ts";
import { createRng } from "./rng.ts";
import { combineStrata, segmentStats, type SegmentStats } from "./segment.ts";
import * as store from "./store.ts";
import { daysBetween, periodEndMs, toSqlDatetime } from "./time.ts";
import { runInsights, type InsightConfig } from "./insights.ts";
import { runAlarms, type AlarmReport, type AlarmThresholds } from "./alarms.ts";

export { runInsights } from "./insights.ts";
export { runAlarms } from "./alarms.ts";
// Not called by runEngineJob or the scheduler: run it after the job, at most a few times a day (it calls the LLM).
export { runNarrative } from "./narrative.ts";

export interface JobOptions {
  now?: number;
  config?: Partial<EngineConfig>;
  /** Overrides for insight thresholds (tests, simulations). */
  insight?: Partial<InsightConfig>;
  /** Overrides for alarm thresholds (tests, simulations). */
  thresholds?: Partial<AlarmThresholds>;
}

export interface JobReport {
  engineVersion: string;
  periods: string[];
  aggregates: number;
  suppressed: number;
  importanceRows: number;
  bootstrapped: boolean;
  scoresFilled: number;
  insights: { written: number; suppressed: number };
  alarms: AlarmReport;
}

interface ReplayRow {
  id: number;
  compte_id: string;
  pregunta_id: number;
  valor_num: number | null;
  value_json: string | null;
  score: number | null;
  periode: string;
  data: string;
  collectiu_id: number;
  torn_id: number | null;
  /** 1 when the answer was to a follow-up slot of the daily batch. */
  followup_slot: number;
}

const key = (a: string, d: number) => `${a}|${d}`;

export function runEngineJob(db: SqlDatabase, opts: JobOptions = {}): JobReport {
  const cfg: EngineConfig = resolveConfig(db, opts.config);
  const nowMs = opts.now ?? Date.now();
  const questions = store.allQuestions(db);
  const domains = store.domainIds(db);
  const pop = store.population(db);
  const rows = all<ReplayRow>(
    db,
    `SELECT r.id, r.compte_id, r.pregunta_id, r.valor_num, r.value_json, r.score, r.periode, r.data, c.collectiu_id, c.torn_id,
       EXISTS (SELECT 1 FROM assignment a WHERE a.compte_id = r.compte_id AND a.pregunta_id = r.pregunta_id
               AND a.reason = 'followup' AND a.day = date(r.data)) AS followup_slot
     FROM resposta r JOIN compte c ON c.id = r.compte_id ORDER BY r.data, r.id`,
  );

  const accounts = new Map<string, { c: number; t: number | null }>();
  const persons = new Map<string, PersonDomainState>();
  const items = new Map<number, ItemStats>();
  const filledScores: [number, number][] = [];
  const periods = [...new Set(rows.map((r) => r.periode))].sort();
  // respondents[period][`${collectiu}|${torn}|${domain}`] = set of accounts with a scored answer
  const respondents = new Map<string, Map<string, Set<string>>>();
  const rankings = new Map<string, { c: number; acct: string; w: Map<number, number> }[]>();
  const aggregates: unknown[][] = [];
  const importance: unknown[][] = [];
  let suppressed = 0;

  const snapshot = (periode: string) => {
    const refSql = toSqlDatetime(Math.min(nowMs, periodEndMs(periode)));
    const resp = respondents.get(periode) ?? new Map<string, Set<string>>();
    const count = (c: number | null, t: number | null | "any", d: number) => {
      const s = new Set<string>();
      for (const [k, v] of resp) {
        const [kc, kt, kd] = k.split("|");
        if (Number(kd) !== d) continue;
        if (c !== null && Number(kc) !== c) continue;
        if (t !== "any" && kt !== String(t)) continue;
        v.forEach((a) => s.add(a));
      }
      return s.size;
    };
    const stratum = (c: number, t: number | null, d: number, N: number): SegmentStats => {
      const points = [];
      for (const [acct, info] of accounts) {
        if (info.c !== c || info.t !== t) continue;
        const s = persons.get(key(acct, d));
        if (s && s.lastAt <= refSql) points.push({ level: s.level, variance: s.variance, daysSince: daysBetween(s.lastAt, refSql) });
      }
      return segmentStats(points, N, cfg, priorLevel(cfg, d));
    };
    const emit = (c: number | null, t: number | null, d: number, st: SegmentStats, n: number) => {
      const hide = n < cfg.minGroupSize;
      if (hide) suppressed++;
      aggregates.push([
        periode, c, t, d, n,
        hide ? null : 1 + 4 * st.mean,
        hide ? null : st.score,
        hide ? null : st.confidence,
        hide ? null : st.consensus,
        hide ? 1 : 0,
      ]);
    };

    const collectives = [...new Set(pop.map((p) => p.collectiuId))].sort((a, b) => a - b);
    for (const d of domains) {
      const company: { N: number; stats: SegmentStats }[] = [];
      for (const c of collectives) {
        const strata = pop.filter((p) => p.collectiuId === c);
        const hasShifts = strata.some((p) => p.tornId !== null);
        const parts = strata.map((p) => ({ N: p.n, t: p.tornId, stats: stratum(c, p.tornId, d, p.n) }));
        if (hasShifts) for (const p of parts) if (p.t !== null) emit(c, p.t, d, p.stats, count(c, p.t, d));
        const combined = combineStrata(parts, cfg);
        emit(c, null, d, combined, count(c, "any", d));
        company.push({ N: parts.reduce((s, p) => s + p.N, 0), stats: combined });
      }
      emit(null, null, d, combineStrata(company, cfg), count(null, "any", d));
    }

    // Domain importance from rankings answered in this period.
    const rk = rankings.get(periode) ?? [];
    for (const c of [...collectives, null]) {
      const mine = rk.filter((r) => c === null || r.c === c);
      const n = new Set(mine.map((r) => r.acct)).size;
      for (const d of domains) {
        const ws = mine.flatMap((r) => (r.w.has(d) ? [r.w.get(d)!] : []));
        if (ws.length === 0) continue;
        const hide = n < cfg.minGroupSize;
        importance.push([periode, c, d, n, hide ? null : ws.reduce((s, x) => s + x, 0) / ws.length, hide ? 1 : 0]);
      }
    }
  };

  let current: string | undefined;
  for (const r of rows) {
    if (current !== undefined && r.periode !== current) snapshot(current);
    current = r.periode;
    accounts.set(r.compte_id, { c: r.collectiu_id, t: r.torn_id });
    const q = questions.get(r.pregunta_id);
    if (!q) continue;

    if (q.type === "ranking") {
      const parsed = parseAnswer(q, { valueJson: r.value_json ? (JSON.parse(r.value_json) as number[]) : null });
      if (parsed.ok && parsed.value.valueJson) {
        const list = rankings.get(r.periode) ?? [];
        list.push({ c: r.collectiu_id, acct: r.compte_id, w: bordaWeights(q.options as RankingOption[], parsed.value.valueJson) });
        rankings.set(r.periode, list);
      }
      continue;
    }
    if (!isClosed(q.type)) continue;

    let score = r.score;
    if (score === null) {
      // Seeded or legacy rows: compute the score from the raw value.
      const parsed = parseAnswer(q, { valorNum: r.valor_num });
      if (!parsed.ok || parsed.value.score === null) continue;
      score = parsed.value.score;
      filledScores.push([score, r.id]);
    }
    const day = r.data.slice(0, 10);
    const out = learn(
      { person: persons.get(key(r.compte_id, q.domainId)) ?? null, item: items.get(q.id) ?? { ...EMPTY_ITEM }, question: q, score, at: r.data, day, isFollowup: q.isFollowup || r.followup_slot === 1 },
      cfg,
      createRng(`${r.compte_id}|${q.domainId}|${day}`),
    );
    persons.set(key(r.compte_id, q.domainId), out.person);
    items.set(q.id, out.item);

    const per = respondents.get(r.periode) ?? new Map<string, Set<string>>();
    const k = `${r.collectiu_id}|${r.torn_id}|${q.domainId}`;
    (per.get(k) ?? per.set(k, new Set()).get(k)!).add(r.compte_id);
    respondents.set(r.periode, per);
  }
  if (current !== undefined) snapshot(current);

  let bootstrapped = false;
  transaction(db, () => {
    if (periods.length) {
      const marks = periods.map(() => "?").join(",");
      run(db, `DELETE FROM agregat WHERE periode IN (${marks})`, ...periods);
      run(db, `DELETE FROM domain_importance WHERE periode IN (${marks})`, ...periods);
    }
    const insA = db.prepare(
      "INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, mitjana, score, confidence, consensus, suprimit) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    for (const a of aggregates) insA.run(...(a as never[]));
    const insI = db.prepare("INSERT INTO domain_importance (periode, collectiu_id, domini_id, n, importance, suprimit) VALUES (?,?,?,?,?,?)");
    for (const i of importance) insI.run(...(i as never[]));
    const fill = db.prepare("UPDATE resposta SET score = ? WHERE id = ? AND score IS NULL");
    for (const [s, id] of filledScores) fill.run(s, id);

    // Fresh database (e.g. right after seeding): adopt the replayed state so the live engine starts trained.
    if ((one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM person_domain_state")?.n ?? 0) === 0) {
      for (const [k, s] of persons) {
        const i = k.lastIndexOf("|");
        store.putPersonState(db, k.slice(0, i), Number(k.slice(i + 1)), s);
      }
      bootstrapped = true;
    }
    if ((one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM item_stats")?.n ?? 0) === 0)
      for (const [id, s] of items) store.putItemStats(db, id, s);

    writeSystemKey(db, "engine_version", ENGINE_VERSION);
    writeSystemKey(db, "last_job_at", toSqlDatetime(nowMs));
  });

  // Both read the aggregates just written, so they run after the transaction above has committed.
  const insights = runInsights(db, { now: nowMs, config: opts.config, insight: opts.insight });
  const alarms = runAlarms(db, { now: nowMs, config: opts.config, thresholds: opts.thresholds });

  return {
    engineVersion: ENGINE_VERSION,
    periods,
    aggregates: aggregates.length,
    suppressed,
    importanceRows: importance.length,
    bootstrapped,
    scoresFilled: filledScores.length,
    insights,
    alarms,
  };
}

export { startEngineScheduler, DEFAULT_INTERVAL_MS } from "./scheduler.ts";
export type { EngineScheduler, SchedulerOptions } from "./scheduler.ts";
