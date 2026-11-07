// Insights: periodic dashboard cards written to `insight`. docs/engine.md section 6.
// Runs after runEngineJob has written `agregat` and `domain_importance`. Reads those plus engine-internal
// per-account history (`resposta`, `assignment`) which never leaves this module: every row written is an
// aggregate over at least minGroupSize people, or a suppressed row with value and detail_json NULL.
import { getConfig, resolveConfig, type EngineConfig } from "./config.ts";
import { all, transaction, type SqlDatabase } from "./db.ts";
import { EMPTY_ITEM, type ItemStats } from "./item-bias.ts";
import { isClosed, learn, priorLevel } from "./learn.ts";
import { loadAnchors, type Anchor } from "./listen-again.ts";
import { parseAnswer } from "./normalize.ts";
import type { PersonDomainState } from "./person.ts";
import { createRng } from "./rng.ts";
import { segmentStats, type PersonPoint } from "./segment.ts";
import * as store from "./store.ts";
import { dayOf, periodEndMs, toMs, toSqlDatetime } from "./time.ts";

export type InsightKind =
  | "domain_state"
  | "top_mover"
  | "polarisation"
  | "importance_gap"
  | "trajectory_mix"
  | "followup_confirmation"
  | "segment_gap"
  | "action_effect"
  | "narrative";

/** Kinds this module writes (and replaces on every run). `narrative` comes from narrative.ts and is not replaced here. `driver` is not implemented yet. */
export const INSIGHT_KINDS: readonly InsightKind[] = [
  "domain_state",
  "top_mover",
  "polarisation",
  "importance_gap",
  "trajectory_mix",
  "followup_confirmation",
  "segment_gap",
  "action_effect",
];

export interface InsightConfig {
  /** top_mover only considers segments with confidence ≥ this in both periods (engine_config `insight_min_confidence`). */
  minConfidence: number;
  /** How many top movers per period. */
  topMovers: number;
  /** Smallest score change (0..10) that counts as a mover. */
  topMoverMinDelta: number;
  /** polarisation: consensus fell by at least this many points... */
  polarisationDrop: number;
  /** ...while the score moved less than this (0..10). */
  polarisationMaxScoreMove: number;
  /** trajectory_mix window. */
  trajectoryDays: number;
  /** trajectory_mix: change (0..10) over the window that counts as improving / declining. */
  trajectoryThreshold: number;
  /** action_effect: days compared before and after the anchor. */
  effectWindowDays: number;
  /** action_effect: no row until this many days have passed since the anchor. */
  effectMinAfterDays: number;
}

export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  minConfidence: 60,
  topMovers: 5,
  topMoverMinDelta: 0.3,
  polarisationDrop: 15,
  polarisationMaxScoreMove: 0.5,
  trajectoryDays: 30,
  trajectoryThreshold: 0.5,
  effectWindowDays: 30,
  effectMinAfterDays: 14,
};

export interface InsightOptions {
  now: number;
  config?: Partial<EngineConfig>;
  insight?: Partial<InsightConfig>;
}

export interface InsightRow {
  kind: InsightKind;
  periode: string;
  collectiuId: number | null;
  tornId: number | null;
  domainId: number | null;
  n: number;
  value: number | null;
  detail: Record<string, unknown> | null;
}

// --- inputs ---------------------------------------------------------------------------------

export interface AggregateRow {
  periode: string;
  collectiuId: number | null;
  tornId: number | null;
  domainId: number;
  n: number;
  score: number | null;
  confidence: number | null;
  consensus: number | null;
  suppressed: boolean;
}

export interface ImportanceRow {
  periode: string;
  collectiuId: number | null;
  domainId: number;
  n: number;
  importance: number | null;
  suppressed: boolean;
}

export interface Labels {
  collective: Map<number, string>;
  shift: Map<number, string>;
  domain: Map<number, string>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const segKey = (c: number | null, t: number | null, d: number | null) => `${c}|${t}|${d}`;

function labelsFor(L: Labels, c: number | null, t: number | null, d: number | null) {
  return {
    collective: c === null ? "All" : (L.collective.get(c) ?? String(c)),
    shift: t === null ? null : (L.shift.get(t) ?? String(t)),
    domain: d === null ? null : (L.domain.get(d) ?? String(d)),
  };
}

const visible = (a: AggregateRow | undefined): a is AggregateRow & { score: number; confidence: number; consensus: number } =>
  !!a && !a.suppressed && a.score !== null && a.confidence !== null && a.consensus !== null;

const snap = (a: AggregateRow & { score: number; confidence: number; consensus: number }) => ({
  periode: a.periode,
  score: a.score,
  confidence: a.confidence,
  consensus: a.consensus,
  n: a.n,
});

function suppressedRow(kind: InsightKind, periode: string, c: number | null, t: number | null, d: number | null, n: number): InsightRow {
  return { kind, periode, collectiuId: c, tornId: t, domainId: d, n, value: null, detail: null };
}

// --- pure: insights from aggregate tables ---------------------------------------------------------

/** domain_state, top_mover, polarisation and the shift half of segment_gap, from `agregat` rows. Pure. */
export function aggregateInsights(rows: AggregateRow[], L: Labels, ic: InsightConfig): InsightRow[] {
  const out: InsightRow[] = [];
  const periods = [...new Set(rows.map((r) => r.periode))].sort();
  const byPeriod = new Map<string, Map<string, AggregateRow>>();
  for (const r of rows) {
    const m = byPeriod.get(r.periode) ?? byPeriod.set(r.periode, new Map()).get(r.periode)!;
    m.set(segKey(r.collectiuId, r.tornId, r.domainId), r);
  }

  periods.forEach((periode, i) => {
    const cur = byPeriod.get(periode)!;
    const prevMap = i > 0 ? byPeriod.get(periods[i - 1]!) : undefined;
    const movers: { row: AggregateRow & { score: number; confidence: number; consensus: number }; prev: ReturnType<typeof snap>; delta: number }[] = [];

    for (const [k, a] of cur) {
      const p = prevMap?.get(k);
      if (!visible(a)) {
        out.push(suppressedRow("domain_state", periode, a.collectiuId, a.tornId, a.domainId, a.n));
        continue;
      }
      const prev = visible(p) ? snap(p) : null;
      const delta = prev ? r2(a.score - prev.score) : null;
      out.push({
        kind: "domain_state",
        periode,
        collectiuId: a.collectiuId,
        tornId: a.tornId,
        domainId: a.domainId,
        n: a.n,
        value: a.score,
        detail: { labels: labelsFor(L, a.collectiuId, a.tornId, a.domainId), current: snap(a), previous: prev, delta },
      });
      if (!prev || delta === null) continue;

      if (a.confidence >= ic.minConfidence && prev.confidence >= ic.minConfidence && Math.abs(delta) >= ic.topMoverMinDelta)
        movers.push({ row: a, prev, delta });

      const drop = r2(prev.consensus - a.consensus);
      if (drop >= ic.polarisationDrop && Math.abs(delta) < ic.polarisationMaxScoreMove)
        out.push({
          kind: "polarisation",
          periode,
          collectiuId: a.collectiuId,
          tornId: a.tornId,
          domainId: a.domainId,
          n: a.n,
          value: drop,
          detail: { labels: labelsFor(L, a.collectiuId, a.tornId, a.domainId), current: snap(a), previous: prev, consensusDrop: drop, scoreDelta: delta },
        });
    }

    movers
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.delta - y.delta)
      .slice(0, ic.topMovers)
      .forEach((m, rank) =>
        out.push({
          kind: "top_mover",
          periode,
          collectiuId: m.row.collectiuId,
          tornId: m.row.tornId,
          domainId: m.row.domainId,
          n: m.row.n,
          value: m.delta,
          detail: {
            labels: labelsFor(L, m.row.collectiuId, m.row.tornId, m.row.domainId),
            rank: rank + 1,
            direction: m.delta > 0 ? "up" : "down",
            current: snap(m.row),
            previous: m.prev,
            delta: m.delta,
          },
        }),
      );

    // Shift gap: within a collective, the spread between its shifts' scores.
    const groups = new Map<string, AggregateRow[]>();
    for (const a of cur.values()) {
      if (a.tornId === null || a.collectiuId === null) continue;
      const g = `${a.collectiuId}|${a.domainId}`;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(a);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const c = g[0]!.collectiuId;
      const d = g[0]!.domainId;
      const shown = g.filter(visible).sort((x, y) => x.score - y.score || (x.tornId ?? 0) - (y.tornId ?? 0));
      if (shown.length < 2) {
        out.push(suppressedRow("segment_gap", periode, c, null, d, Math.min(...g.map((x) => x.n))));
        continue;
      }
      const lo = shown[0]!;
      const hi = shown[shown.length - 1]!;
      const shift = (x: (typeof shown)[number]) => ({ tornId: x.tornId, label: labelsFor(L, c, x.tornId, d).shift, score: x.score, n: x.n });
      out.push({
        kind: "segment_gap",
        periode,
        collectiuId: c,
        tornId: lo.tornId,
        domainId: d,
        n: Math.min(...shown.map((x) => x.n)),
        value: r2(hi.score - lo.score),
        detail: {
          dimension: "shift",
          labels: labelsFor(L, c, null, d),
          lowest: shift(lo),
          highest: shift(hi),
          groups: shown.map(shift),
          gap: r2(hi.score - lo.score),
        },
      });
    }
  });
  return out;
}

/** importance_gap: domains ranked important but scored low, per period × collective. Pure. */
export function importanceGapInsights(importance: ImportanceRow[], agg: AggregateRow[], L: Labels): InsightRow[] {
  const out: InsightRow[] = [];
  const scoreOf = new Map(agg.filter((a) => a.tornId === null).map((a) => [`${a.periode}|${segKey(a.collectiuId, null, a.domainId)}`, a]));
  const groups = new Map<string, ImportanceRow[]>();
  for (const r of importance) {
    const g = `${r.periode}|${r.collectiuId}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
  }
  for (const rows of groups.values()) {
    const items: { r: ImportanceRow; importance: number; score: number; n: number; priority: number }[] = [];
    for (const r of rows) {
      const a = scoreOf.get(`${r.periode}|${segKey(r.collectiuId, null, r.domainId)}`);
      const n = Math.min(r.n, a?.n ?? r.n);
      if (r.suppressed || r.importance === null || !visible(a)) {
        out.push(suppressedRow("importance_gap", r.periode, r.collectiuId, null, r.domainId, n));
        continue;
      }
      // Priority to act: important (0..1) times how far from the top the score is (0..1).
      items.push({ r, importance: r.importance, score: a.score, n, priority: r.importance * (1 - a.score / 10) });
    }
    if (items.length === 0) continue;
    const meanImp = items.reduce((s, x) => s + x.importance, 0) / items.length;
    const meanScore = items.reduce((s, x) => s + x.score, 0) / items.length;
    items
      .sort((x, y) => y.priority - x.priority || x.r.domainId - y.r.domainId)
      .forEach((x, i) => {
        const important = x.importance >= meanImp;
        const low = x.score <= meanScore;
        out.push({
          kind: "importance_gap",
          periode: x.r.periode,
          collectiuId: x.r.collectiuId,
          tornId: null,
          domainId: x.r.domainId,
          n: x.n,
          value: r2(x.priority),
          detail: {
            labels: labelsFor(L, x.r.collectiuId, null, x.r.domainId),
            importance: r2(x.importance),
            score: x.score,
            priority: r2(x.priority),
            rank: i + 1,
            quadrant: important ? (low ? "act_first" : "maintain") : low ? "monitor" : "low_priority",
            importanceN: x.r.n,
          },
        });
      });
  }
  return out;
}

// --- per-account history (engine-internal, never returned) --------------------------------------

interface Trace {
  ms: number[];
  level: number[];
  variance: number[];
}

interface FollowupEvent {
  acct: string;
  c: number;
  d: number;
  periode: string;
  confirmed: boolean;
  dir: 1 | -1 | null;
}

export interface History {
  accounts: Map<string, { c: number; t: number | null; manager: boolean }>;
  traces: Map<string, Trace>;
  /** respondents[periode][domain] = accounts with a scored answer in that domain and period. */
  respondents: Map<string, Map<number, Set<string>>>;
  followups: FollowupEvent[];
  periods: string[];
}

interface HistRow {
  id: number;
  compte_id: string;
  pregunta_id: number;
  valor_num: number | null;
  score: number | null;
  periode: string;
  data: string;
  collectiu_id: number;
  torn_id: number | null;
  es_manager: number;
}

/**
 * Replays every closed answer through the same learning step as the job, keeping each person's level after
 * every observation (person_domain_state only holds the latest one) and every follow-up resolution.
 * A follow-up is an answer to an `assignment` with reason 'followup' or to a follow-up-worded item, as in live submission.
 */
function replayHistory(db: SqlDatabase, cfg: EngineConfig): History {
  const questions = store.allQuestions(db);
  const rows = all<HistRow>(
    db,
    `SELECT r.id, r.compte_id, r.pregunta_id, r.valor_num, r.score, r.periode, r.data, c.collectiu_id, c.torn_id, c.es_manager
     FROM resposta r JOIN compte c ON c.id = r.compte_id ORDER BY r.data, r.id`,
  );
  const fuAssigned = new Set(
    all<{ k: string }>(db, "SELECT compte_id || '|' || pregunta_id || '|' || day AS k FROM assignment WHERE reason = 'followup'").map((r) => r.k),
  );
  const h: History = { accounts: new Map(), traces: new Map(), respondents: new Map(), followups: [], periods: [] };
  const persons = new Map<string, PersonDomainState>();
  const items = new Map<number, ItemStats>();
  const periods = new Set<string>();

  for (const r of rows) {
    periods.add(r.periode);
    h.accounts.set(r.compte_id, { c: r.collectiu_id, t: r.torn_id, manager: r.es_manager === 1 });
    const q = questions.get(r.pregunta_id);
    if (!q || !isClosed(q.type)) continue;
    let score = r.score;
    if (score === null) {
      const parsed = parseAnswer(q, { valorNum: r.valor_num });
      if (!parsed.ok || parsed.value.score === null) continue;
      score = parsed.value.score;
    }
    const ms = toMs(r.data);
    const day = dayOf(ms, cfg.timezone); // local day, as live submission uses it
    const isFollowup = q.isFollowup || fuAssigned.has(`${r.compte_id}|${q.id}|${day}`);
    const pk = `${r.compte_id}|${q.domainId}`;
    const res = learn(
      { person: persons.get(pk) ?? null, item: items.get(q.id) ?? { ...EMPTY_ITEM }, question: q, score, at: r.data, day, isFollowup },
      cfg,
      createRng(`${r.compte_id}|${q.domainId}|${day}`),
    );
    persons.set(pk, res.person);
    items.set(q.id, res.item);
    const tr = h.traces.get(pk) ?? h.traces.set(pk, { ms: [], level: [], variance: [] }).get(pk)!;
    tr.ms.push(ms);
    tr.level.push(res.person.level);
    tr.variance.push(res.person.variance);
    const per = h.respondents.get(r.periode) ?? h.respondents.set(r.periode, new Map()).get(r.periode)!;
    (per.get(q.domainId) ?? per.set(q.domainId, new Set()).get(q.domainId)!).add(r.compte_id);
    if (res.followup === "confirmed" || res.followup === "noise")
      h.followups.push({
        acct: r.compte_id,
        c: r.collectiu_id,
        d: q.domainId,
        periode: r.periode,
        confirmed: res.followup === "confirmed",
        dir: res.followup === "confirmed" ? res.person.confirmedChangeDir : null,
      });
  }
  h.periods = [...periods].sort();
  return h;
}

/** Index of the last observation at or before ms, or -1. */
function lastAtOrBefore(tr: Trace, ms: number): number {
  let i = -1;
  for (let k = 0; k < tr.ms.length && tr.ms[k]! <= ms; k++) i = k;
  return i;
}

/** Change of a person's level (0..10) over the window ending at refMs, or null if there is not enough history. */
export function windowChange(tr: Trace, refMs: number, days: number): number | null {
  const end = lastAtOrBefore(tr, refMs);
  if (end < 0) return null;
  const startMs = refMs - days * 86_400_000;
  let base = lastAtOrBefore(tr, startMs);
  if (base < 0) {
    // No baseline before the window: use the first answer in it, if the window still spans at least a week.
    base = tr.ms.findIndex((m) => m > startMs);
    if (base < 0 || tr.ms[end]! - tr.ms[base]! < 7 * 86_400_000) return null;
  }
  if (end <= base) return null; // no answer inside the window
  return 10 * (tr.level[end]! - tr.level[base]!);
}

interface Scope {
  c: number | null;
  t: number | null | "any";
}

const inScope = (s: Scope, a: { c: number; t: number | null }) => (s.c === null || a.c === s.c) && (s.t === "any" || a.t === s.t);

function scopes(h: History): Scope[] {
  const out: Scope[] = [{ c: null, t: "any" }];
  const cs = [...new Set([...h.accounts.values()].map((a) => a.c))].sort((a, b) => a - b);
  for (const c of cs) {
    out.push({ c, t: "any" });
    const ts = [...new Set([...h.accounts.values()].filter((a) => a.c === c && a.t !== null).map((a) => a.t as number))].sort((a, b) => a - b);
    for (const t of ts) out.push({ c, t });
  }
  return out;
}

/** trajectory_mix, followup_confirmation and the manager half of segment_gap, from per-account history. */
export function historyInsights(
  h: History,
  domains: number[],
  L: Labels,
  cfg: EngineConfig,
  ic: InsightConfig,
  nowMs: number,
  managerPopulation: (c: number | null, manager: boolean) => number,
): InsightRow[] {
  const out: InsightRow[] = [];
  const min = cfg.minGroupSize;
  const allScopes = scopes(h);

  for (const periode of h.periods) {
    const refMs = Math.min(nowMs, periodEndMs(periode));
    const refSql = toSqlDatetime(refMs);

    // trajectory_mix: share of people improving / stable / declining over the window, per segment × domain.
    for (const s of allScopes) {
      for (const d of domains) {
        let up = 0;
        let flat = 0;
        let down = 0;
        for (const [acct, a] of h.accounts) {
          if (!inScope(s, a)) continue;
          const tr = h.traces.get(`${acct}|${d}`);
          const ch = tr ? windowChange(tr, refMs, ic.trajectoryDays) : null;
          if (ch === null) continue;
          if (ch >= ic.trajectoryThreshold) up++;
          else if (ch <= -ic.trajectoryThreshold) down++;
          else flat++;
        }
        const n = up + flat + down;
        if (n === 0) continue;
        const t = s.t === "any" ? null : s.t;
        if (n < min) {
          out.push(suppressedRow("trajectory_mix", periode, s.c, t, d, n));
          continue;
        }
        const pct = (x: number) => r1((100 * x) / n);
        out.push({
          kind: "trajectory_mix",
          periode,
          collectiuId: s.c,
          tornId: t,
          domainId: d,
          n,
          value: pct(down),
          detail: { labels: labelsFor(L, s.c, t, d), improving: pct(up), stable: pct(flat), declining: pct(down), windowDays: ic.trajectoryDays, n },
        });
      }
    }

    // followup_confirmation: share of resolved follow-ups that confirmed the change, per collective × domain.
    const fus = h.followups.filter((f) => f.periode === periode);
    for (const s of allScopes.filter((x) => x.t === "any")) {
      for (const d of domains) {
        const mine = fus.filter((f) => f.d === d && (s.c === null || f.c === s.c));
        if (mine.length === 0) continue;
        const n = new Set(mine.map((f) => f.acct)).size;
        if (n < min) {
          out.push(suppressedRow("followup_confirmation", periode, s.c, null, d, n));
          continue;
        }
        const confirmed = mine.filter((f) => f.confirmed);
        const rate = r1((100 * confirmed.length) / mine.length);
        out.push({
          kind: "followup_confirmation",
          periode,
          collectiuId: s.c,
          tornId: null,
          domainId: d,
          n,
          value: rate,
          detail: {
            labels: labelsFor(L, s.c, null, d),
            resolved: mine.length,
            confirmed: confirmed.length,
            confirmedDown: confirmed.filter((f) => f.dir === -1).length,
            confirmedUp: confirmed.filter((f) => f.dir === 1).length,
            rate,
            n,
          },
        });
      }
    }

    // segment_gap (managers): managers vs non-managers, per collective × domain, from people who answered this period.
    const resp = h.respondents.get(periode) ?? new Map<number, Set<string>>();
    for (const s of allScopes.filter((x) => x.t === "any")) {
      for (const d of domains) {
        const who = resp.get(d) ?? new Set<string>();
        const groups = [true, false].map((manager) => {
          const points: PersonPoint[] = [];
          for (const acct of who) {
            const a = h.accounts.get(acct)!;
            if (a.manager !== manager || !inScope(s, a)) continue;
            const tr = h.traces.get(`${acct}|${d}`)!;
            const i = lastAtOrBefore(tr, refMs);
            if (i < 0) continue;
            points.push({ level: tr.level[i]!, variance: tr.variance[i]!, daysSince: (refMs - tr.ms[i]!) / 86_400_000 });
          }
          return { manager, points, stats: segmentStats(points, managerPopulation(s.c, manager), cfg, priorLevel(cfg, d)) };
        });
        const [m, o] = groups as [(typeof groups)[number], (typeof groups)[number]];
        if (m.points.length === 0 || o.points.length === 0) continue;
        const n = Math.min(m.points.length, o.points.length);
        if (n < min) {
          out.push(suppressedRow("segment_gap", periode, s.c, null, d, n));
          continue;
        }
        const gap = r2(m.stats.score - o.stats.score);
        out.push({
          kind: "segment_gap",
          periode,
          collectiuId: s.c,
          tornId: null,
          domainId: d,
          n,
          value: gap,
          detail: {
            dimension: "manager",
            labels: labelsFor(L, s.c, null, d),
            managers: { score: m.stats.score, confidence: m.stats.confidence, n: m.points.length },
            others: { score: o.stats.score, confidence: o.stats.confidence, n: o.points.length },
            gap,
            asOf: refSql,
          },
        });
      }
    }
  }
  return out;
}

// --- action_effect ("listen again") ---------------------------------------------------------

export const ACTION_EFFECT_LIMITS =
  "Això mostra què ha passat amb la puntuació des d'aquesta data, no que l'acció en sigui la causa: l'estacionalitat, altres canvis o accions i qui respon en cada moment també hi poden influir.";

/**
 * For each anchor (adopted recommendation, context event with a domain): the segment × domain score in the window before vs after it.
 * Before = each person's last level before the anchor, among people who answered in the `effectWindowDays` before it.
 * After = their last level up to anchor + window (or now), among people who answered after the anchor.
 * Both windows need at least `minGroupSize` people, or the row is suppressed. Change rule as top_mover: |Δ| ≥ topMoverMinDelta and
 * confidence ≥ minConfidence in both windows. Nothing is written until `effectMinAfterDays` have passed since the anchor.
 */
export function actionEffectInsights(
  h: History,
  anchors: Anchor[],
  L: Labels,
  cfg: EngineConfig,
  ic: InsightConfig,
  nowMs: number,
  populationOf: (c: number | null, t: number | null) => number,
): InsightRow[] {
  const out: InsightRow[] = [];
  const DAY = 86_400_000;
  const nowPeriod = dayOf(nowMs, cfg.timezone).slice(0, 7);
  for (const a of anchors) {
    const afterEnd = Math.min(nowMs, a.ms + ic.effectWindowDays * DAY);
    if (afterEnd - a.ms < ic.effectMinAfterDays * DAY) continue;
    const scope: Scope = { c: a.collectiuId, t: a.tornId === null ? "any" : a.tornId };
    const before: PersonPoint[] = [];
    const after: PersonPoint[] = [];
    for (const [acct, who] of h.accounts) {
      if (!inScope(scope, who)) continue;
      const tr = h.traces.get(`${acct}|${a.domainId}`);
      if (!tr) continue;
      const ib = lastAtOrBefore(tr, a.ms - 1);
      if (ib >= 0 && tr.ms[ib]! >= a.ms - ic.effectWindowDays * DAY)
        before.push({ level: tr.level[ib]!, variance: tr.variance[ib]!, daysSince: (a.ms - tr.ms[ib]!) / DAY });
      const ia = lastAtOrBefore(tr, afterEnd);
      if (ia >= 0 && tr.ms[ia]! >= a.ms) after.push({ level: tr.level[ia]!, variance: tr.variance[ia]!, daysSince: (afterEnd - tr.ms[ia]!) / DAY });
    }
    if (before.length === 0 && after.length === 0) continue;
    const t = a.tornId;
    const n = Math.min(before.length, after.length);
    if (n < cfg.minGroupSize) {
      out.push(suppressedRow("action_effect", nowPeriod, a.collectiuId, t, a.domainId, n));
      continue;
    }
    const N = populationOf(a.collectiuId, t);
    const prior = priorLevel(cfg, a.domainId);
    const b = segmentStats(before, N, cfg, prior);
    const f = segmentStats(after, N, cfg, prior);
    const delta = r2(f.score - b.score);
    const confident = b.confidence >= ic.minConfidence && f.confidence >= ic.minConfidence;
    const change = !confident ? "low_confidence" : Math.abs(delta) >= ic.topMoverMinDelta ? (delta > 0 ? "improved" : "declined") : "no_clear_change";
    const lbl = labelsFor(L, a.collectiuId, t, a.domainId);
    const seg = [lbl.collective, lbl.shift, lbl.domain].filter(Boolean).join(" · ");
    const span = `${b.score} → ${f.score}, n ${before.length} → ${after.length}`;
    const wording =
      change === "improved" ? `Des de ${a.date}, ${seg}: la puntuació ha pujat (${span}).`
      : change === "declined" ? `Des de ${a.date}, ${seg}: la puntuació ha baixat (${span}).`
      : change === "no_clear_change" ? `Des de ${a.date}, ${seg}: sense canvi clar (${span}).`
      : `Des de ${a.date}, ${seg}: encara no hi ha prou confiança per comparar (${span}).`;
    const win = (from: number, to: number, s: typeof b, cnt: number) => ({
      from: toSqlDatetime(from).slice(0, 10),
      to: toSqlDatetime(to).slice(0, 10),
      score: s.score,
      confidence: s.confidence,
      n: cnt,
    });
    out.push({
      kind: "action_effect",
      periode: nowPeriod,
      collectiuId: a.collectiuId,
      tornId: t,
      domainId: a.domainId,
      n,
      value: delta,
      detail: {
        labels: lbl,
        anchor: { kind: a.kind, id: a.id, date: a.date, label: a.label },
        since: a.date,
        before: win(a.ms - ic.effectWindowDays * DAY, a.ms, b, before.length),
        after: win(a.ms, afterEnd, f, after.length),
        delta,
        change,
        windowDays: ic.effectWindowDays,
        wording,
        limits: ACTION_EFFECT_LIMITS,
      },
    });
  }
  return out;
}

// --- IO -------------------------------------------------------------------------------------

function loadInsightConfig(db: SqlDatabase, override: Partial<InsightConfig> | undefined): InsightConfig {
  const raw = getConfig(db);
  const ic = { ...DEFAULT_INSIGHT_CONFIG };
  const mc = raw["insight_min_confidence"];
  if (typeof mc === "number" && Number.isFinite(mc) && mc >= 0) ic.minConfidence = mc;
  return { ...ic, ...override };
}

function loadLabels(db: SqlDatabase): Labels {
  const map = (table: string) => new Map(all<{ id: number; nom: string }>(db, `SELECT id, nom FROM ${table}`).map((r) => [r.id, r.nom]));
  return { collective: map("collectiu"), shift: map("torn"), domain: map("domini") };
}

/**
 * Computes all insights and replaces this module's rows in `insight` for every period it covers. Idempotent.
 * Call after runEngineJob. Returns the number of rows written and how many of them are suppressed (n < minGroupSize).
 */
export function runInsights(db: SqlDatabase, opts: InsightOptions): { written: number; suppressed: number } {
  const cfg: EngineConfig = resolveConfig(db, opts.config);
  const ic = loadInsightConfig(db, opts.insight);
  const L = loadLabels(db);
  const domains = store.domainIds(db);

  const agg = all<{
    periode: string; collectiu_id: number | null; torn_id: number | null; domini_id: number; n: number;
    score: number | null; confidence: number | null; consensus: number | null; suprimit: number;
  }>(db, "SELECT periode, collectiu_id, torn_id, domini_id, n, score, confidence, consensus, suprimit FROM agregat WHERE domini_id IS NOT NULL").map(
    (r): AggregateRow => ({
      periode: r.periode,
      collectiuId: r.collectiu_id,
      tornId: r.torn_id,
      domainId: r.domini_id,
      // Re-check the threshold here too: the config may be stricter than when agregat was written.
      n: r.n,
      score: r.score,
      confidence: r.confidence,
      consensus: r.consensus,
      suppressed: r.suprimit === 1 || r.n < cfg.minGroupSize,
    }),
  );
  const imp = all<{ periode: string; collectiu_id: number | null; domini_id: number; n: number; importance: number | null; suprimit: number }>(
    db,
    "SELECT periode, collectiu_id, domini_id, n, importance, suprimit FROM domain_importance",
  ).map((r): ImportanceRow => ({
    periode: r.periode,
    collectiuId: r.collectiu_id,
    domainId: r.domini_id,
    n: r.n,
    importance: r.importance,
    suppressed: r.suprimit === 1 || r.n < cfg.minGroupSize,
  }));

  const synth = all<{ c: number; m: number; n: number }>(db, "SELECT collectiu_id AS c, es_manager AS m, COUNT(*) AS n FROM empleat_sintetic GROUP BY c, m");
  const popRows = synth.length ? synth : all<{ c: number; m: number; n: number }>(db, "SELECT collectiu_id AS c, es_manager AS m, COUNT(*) AS n FROM compte GROUP BY c, m");
  const managerPopulation = (c: number | null, manager: boolean) =>
    popRows.filter((r) => (c === null || r.c === c) && (r.m === 1) === manager).reduce((s, r) => s + r.n, 0);

  const history = replayHistory(db, cfg);
  const rows = [
    ...aggregateInsights(agg, L, ic),
    ...importanceGapInsights(imp, agg, L),
    ...historyInsights(history, domains, L, cfg, ic, opts.now, managerPopulation),
    ...actionEffectInsights(history, loadAnchors(db, cfg.timezone), L, cfg, ic, opts.now, (c, t) =>
      store.population(db).filter((r) => (c === null || r.collectiuId === c) && (t === null || r.tornId === t)).reduce((s, r) => s + r.n, 0),
    ),
  ];
  const periods = [...new Set([...agg.map((a) => a.periode), ...imp.map((i) => i.periode), ...history.periods])].sort();

  let suppressed = 0;
  transaction(db, () => {
    // Keyed by the current period, which may not be in `periods`: always replace the whole kind.
    db.prepare("DELETE FROM insight WHERE kind = 'action_effect'").run();
    if (periods.length) {
      db.prepare(
        `DELETE FROM insight WHERE periode IN (${periods.map(() => "?").join(",")}) AND kind IN (${INSIGHT_KINDS.map(() => "?").join(",")})`,
      ).run(...periods, ...INSIGHT_KINDS);
    }
    const ins = db.prepare(
      "INSERT INTO insight (kind, periode, collectiu_id, torn_id, domini_id, n, value, detail_json, suprimit, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    const createdAt = toSqlDatetime(opts.now);
    for (const r of rows) {
      const hide = r.value === null || r.detail === null || r.n < cfg.minGroupSize;
      if (hide) suppressed++;
      ins.run(r.kind, r.periode, r.collectiuId, r.tornId, r.domainId, r.n, hide ? null : r.value, hide ? null : JSON.stringify(r.detail), hide ? 1 : 0, createdAt);
    }
  });
  return { written: rows.length, suppressed };
}
