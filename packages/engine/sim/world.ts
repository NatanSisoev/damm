// Synthetic world for the engine simulator: population, question pool, latent truth and planted signals.
// Everything is generated from a seed. Synthetic data only: no real people, no real company data.
//
// Truth model (all on the engine's 0..1 score scale, 1 = best):
//   theta[p, d, t] = clamp(base[c, d] + trait[p] + own[p, d] + walk[p, d, t] + signals(p, d, t))
// An answer to item i (domain d) by person p on day t is generated from
//   x = theta[p, d, t] + bias[i] + (manager ? managerBias : 0) + noise(type)
// and then mapped to the item's raw answer format (scale, yes/no, option index).
import type { ClosedType } from "../src/config.ts";
import { createRng, type Rng } from "../src/rng.ts";
import { addDays } from "../src/time.ts";

export const DOMAINS = [
  "Benestar",
  "Lideratge",
  "Desenvolupament",
  "Cultura i pertinença",
  "Entorn i relacions",
  "Condicions i organització",
] as const;
export const D_LIDERATGE = 2;
export const D_CONDICIONS = 6;

export const SHIFTS = [
  { id: 1, name: "mati" },
  { id: 2, name: "tarda" },
  { id: 3, name: "nit" },
] as const;

export interface Stratum {
  collectiuId: number;
  tornId: number | null;
  /** Population size (the representativeness denominator). */
  size: number;
  /** Share of the stratum that has an account and answers. */
  participation: number;
}

export interface Collective {
  id: number;
  name: string;
  centreTipusId: number;
  strata: Stratum[];
  /** Base level per domain (index 0 = domain 1). */
  base: number[];
}

export interface Person {
  /** Index into the population. */
  idx: number;
  collectiuId: number;
  tornId: number | null;
  manager: boolean;
  /** Account id if this person answers, else null. */
  accountId: string | null;
}

export interface WorldItem {
  id: number;
  domainId: number;
  type: ClosedType;
  facet: string;
  polarity: 1 | -1;
  /** Wording bias on the 0..1 scale (centred per domain). */
  bias: number;
  options: { label: string; score: number }[] | null;
  isFollowup: boolean;
  text: string;
}

export type SignalKind = "segment_decline" | "segment_step" | "personal_drop";

export interface SegmentSignal {
  name: string;
  kind: "segment_decline" | "segment_step";
  collectiuId: number;
  domainId: number;
  /** Day index where the change starts. */
  onset: number;
  /** Total change in level (negative = drop). */
  delta: number;
  /** Days until the full delta is reached. */
  rampDays: number;
}

export interface PersonalDrop {
  accountId: string;
  personIdx: number;
  domainId: number;
  onset: number;
  delta: number;
}

export interface WorldOptions {
  seed?: string | number;
  /** First day, 'YYYY-MM-DD'. Default 2026-08-01. */
  start?: string;
  /** Number of simulated days. Default 92 (Aug to Oct 2026). */
  days?: number;
  /** Multiplies every stratum's participation (speed vs realism). Default 1. */
  participationScale?: number;
  /** Per-stratum participation override, keyed "collectiuId:tornId" (tornId "0" = no shift). Applied before the scale. */
  participation?: Record<string, number>;
  /** Answer noise sd per type before rounding to the format. */
  answerNoise?: Partial<Record<ClosedType, number>>;
  /** Reporting bias added to managers' answers (not to their true level). Default +0.08. */
  managerBias?: number;
  /** Number of accounts with a planted sharp personal drop in Lideratge. Default 8. */
  personalDrops?: number;
  /** Daily sd of each person's random walk. Default 0.006. */
  walkSd?: number;
}

export interface World {
  seed: string;
  start: string;
  days: number;
  dates: string[];
  collectives: Collective[];
  people: Person[];
  accounts: Person[];
  items: WorldItem[];
  segmentSignals: SegmentSignal[];
  personalDrops: PersonalDrop[];
  managerBias: number;
  answerNoise: Record<ClosedType, number>;
  /** theta for person p, domain d (1-based), day t. */
  level(p: number, d: number, t: number): number;
  /** Population mean of theta for a segment on day t. tornId "any" = whole collective; collectiuId null = company. */
  trueMean(collectiuId: number | null, tornId: number | null | "any", d: number, t: number): number;
  /** Generates one raw answer; returns the engine input value and the realised 0..1 score. */
  answer(rng: Rng, person: Person, item: WorldItem, t: number): { valorNum: number; score: number; answerMs: number };
}

export const DEFAULT_ANSWER_NOISE: Record<ClosedType, number> = {
  scale10: 0.1,
  scale5: 0.1,
  // yes/no: the latent jitter before the Bernoulli draw; the Bernoulli itself adds most of the noise.
  yes_no: 0.05,
  pair: 0.12,
  choice: 0.12,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Day index of a 'YYYY-MM-DD' date relative to start. */
export function dayIndex(start: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

const COLLECTIVES: Omit<Collective, "base">[] = [
  {
    id: 1,
    name: "Fàbriques",
    centreTipusId: 1,
    strata: [
      { collectiuId: 1, tornId: 1, size: 180, participation: 0.35 },
      { collectiuId: 1, tornId: 2, size: 160, participation: 0.3 },
      { collectiuId: 1, tornId: 3, size: 140, participation: 0.12 }, // low night-shift response
    ],
  },
  {
    id: 2,
    name: "Logística",
    centreTipusId: 2,
    strata: [
      { collectiuId: 2, tornId: 1, size: 120, participation: 0.35 },
      { collectiuId: 2, tornId: 2, size: 100, participation: 0.3 },
      { collectiuId: 2, tornId: 3, size: 80, participation: 0.1 }, // around or below the minimum group size
    ],
  },
  { id: 3, name: "Comercial", centreTipusId: 4, strata: [{ collectiuId: 3, tornId: null, size: 220, participation: 0.3 }] },
  { id: 4, name: "Oficines", centreTipusId: 3, strata: [{ collectiuId: 4, tornId: null, size: 200, participation: 0.35 }] },
];

// Base level per collective x domain (0..1), order: Benestar, Lideratge, Desenvolupament, Cultura i pertinença,
// Entorn i relacions, Condicions i organització. Plausible, invented values; each collective has its own profile (shape, not size):
//   Fàbriques: shifts and physical load (low Benestar, Condicions), strong belonging
//   Logística: heat and safety (low Benestar, Entorn), strong culture
//   Comercial: autonomy and growth (high Lideratge, Desenvolupament), targets and travel (low Condicions)
//   Oficines: stable conditions and good relations (high Condicions, Entorn), weaker belonging and development
const BASE: Record<number, number[]> = {
  1: [0.56, 0.6, 0.59, 0.65, 0.64, 0.6],
  2: [0.52, 0.57, 0.56, 0.67, 0.56, 0.62],
  3: [0.62, 0.67, 0.66, 0.6, 0.64, 0.5],
  4: [0.64, 0.62, 0.55, 0.56, 0.7, 0.67],
};

// Three facets per domain; each facet has two wordings of different types.
const FACETS = ["a", "b", "c"] as const;
const FACET_ITEMS: { type: ClosedType; polarity: 1 | -1 }[][] = [
  [
    { type: "scale10", polarity: 1 },
    { type: "yes_no", polarity: 1 },
  ],
  [
    { type: "scale5", polarity: -1 },
    { type: "choice", polarity: 1 },
  ],
  [
    { type: "pair", polarity: 1 },
    { type: "scale10", polarity: -1 },
  ],
];
const PAIR_OPTIONS = [
  { label: "Worse option", score: 0.2 },
  { label: "Better option", score: 0.8 },
];
const CHOICE_OPTIONS = [
  { label: "Never", score: 0 },
  { label: "Sometimes", score: 0.35 },
  { label: "Often", score: 0.7 },
  { label: "Always", score: 1 },
];

export function createWorld(opts: WorldOptions = {}): World {
  const seed = String(opts.seed ?? "damm-sim");
  const rng = createRng(`world|${seed}`);
  const start = opts.start ?? "2026-08-01";
  const days = opts.days ?? 92;
  const dates = Array.from({ length: days }, (_, t) => addDays(start, t));
  const scale = opts.participationScale ?? 1;
  const managerBias = opts.managerBias ?? 0.08;
  const walkSd = opts.walkSd ?? 0.006;
  const answerNoise = { ...DEFAULT_ANSWER_NOISE, ...opts.answerNoise };
  const D = DOMAINS.length;

  const collectives: Collective[] = COLLECTIVES.map((c) => ({ ...c, base: BASE[c.id]! }));

  // Population and accounts.
  const people: Person[] = [];
  for (const c of collectives)
    for (const s of c.strata)
      for (let i = 0; i < s.size; i++)
        people.push({ idx: people.length, collectiuId: c.id, tornId: s.tornId, manager: rng() < 0.08, accountId: null });
  for (const c of collectives)
    for (const s of c.strata) {
      const members = people.filter((p) => p.collectiuId === s.collectiuId && p.tornId === s.tornId);
      const part = opts.participation?.[`${s.collectiuId}:${s.tornId ?? 0}`] ?? s.participation;
      const k = Math.round(members.length * clamp(part * scale, 0, 1));
      for (const p of shuffle(rng, members).slice(0, k)) p.accountId = `acc${String(p.idx).padStart(4, "0")}`;
    }
  const accounts = people.filter((p) => p.accountId !== null);

  // Planted segment signals.
  const day = (d: string) => dayIndex(start, d);
  const planted: SegmentSignal[] = [
    { name: "logistica_condicions_weak_decline", kind: "segment_decline", collectiuId: 2, domainId: D_CONDICIONS, onset: day("2026-08-15"), delta: -0.12, rampDays: 77 },
    { name: "fabriques_october_shift_communication", kind: "segment_step", collectiuId: 1, domainId: D_CONDICIONS, onset: day("2026-10-01"), delta: -0.12, rampDays: 3 },
  ];
  const segmentSignals = planted.filter((s) => s.onset < days);

  // Planted sharp personal drops in Lideratge.
  const nDrops = Math.min(opts.personalDrops ?? 8, accounts.length);
  const lo = Math.min(day("2026-08-25"), days - 1);
  const hi = Math.max(lo, Math.min(day("2026-10-15"), days - 1));
  const personalDrops: PersonalDrop[] = shuffle(rng, accounts)
    .slice(0, nDrops)
    .map((p) => ({ accountId: p.accountId!, personIdx: p.idx, domainId: D_LIDERATGE, onset: lo + Math.floor(rng() * (hi - lo + 1)), delta: -0.35 }));

  // Latent levels: pop × domain × day.
  const P = people.length;
  const theta = new Float32Array(P * D * days);
  const at = (p: number, d0: number, t: number) => (p * D + d0) * days + t;
  const dropsByPerson = new Map(personalDrops.map((x) => [x.personIdx, x]));
  const ramp = (t: number, onset: number, rampDays: number) => (t < onset ? 0 : Math.min(1, (t - onset + 1) / Math.max(1, rampDays)));
  for (const p of people) {
    const c = collectives.find((x) => x.id === p.collectiuId)!;
    const trait = 0.08 * normal(rng);
    for (let d0 = 0; d0 < D; d0++) {
      const own = 0.08 * normal(rng);
      let walk = 0;
      for (let t = 0; t < days; t++) {
        if (t > 0) walk += walkSd * normal(rng);
        let x = c.base[d0]! + trait + own + walk;
        for (const s of segmentSignals)
          if (s.collectiuId === p.collectiuId && s.domainId === d0 + 1) x += s.delta * ramp(t, s.onset, s.rampDays);
        const drop = dropsByPerson.get(p.idx);
        if (drop && drop.domainId === d0 + 1 && t >= drop.onset) x += drop.delta;
        theta[at(p.idx, d0, t)] = clamp(x, 0.02, 0.98);
      }
    }
  }

  // Question pool: per domain 3 facets × 2 wordings + 1 follow-up wording, biases centred per domain.
  const items: WorldItem[] = [];
  for (let d = 1; d <= D; d++) {
    const mine: WorldItem[] = [];
    FACETS.forEach((f, fi) =>
      FACET_ITEMS[fi]!.forEach(({ type, polarity }, wi) =>
        mine.push({
          id: 0,
          domainId: d,
          type,
          facet: `d${d}${f}`,
          polarity,
          bias: 0.07 * normal(rng),
          options: type === "pair" ? PAIR_OPTIONS : type === "choice" ? CHOICE_OPTIONS : null,
          isFollowup: false,
          text: `${DOMAINS[d - 1]} · facet ${f} · wording ${wi + 1} (${type}${polarity === -1 ? ", reversed" : ""})`,
        }),
      ),
    );
    mine.push({
      id: 0,
      domainId: d,
      type: "scale5",
      facet: `d${d}fu`,
      polarity: 1,
      bias: 0.07 * normal(rng),
      options: null,
      isFollowup: true,
      text: `${DOMAINS[d - 1]} · follow-up: has anything changed lately? (scale5)`,
    });
    const mean = mine.reduce((s, i) => s + i.bias, 0) / mine.length;
    for (const i of mine) i.bias -= mean;
    items.push(...mine);
  }
  items.forEach((it, i) => (it.id = i + 1));

  // True segment means per day, precomputed.
  const meanCache = new Map<string, Float64Array>();
  function trueMean(collectiuId: number | null, tornId: number | null | "any", d: number, t: number): number {
    const k = `${collectiuId}|${tornId}|${d}`;
    let series = meanCache.get(k);
    if (!series) {
      const members = people.filter((p) => (collectiuId === null || p.collectiuId === collectiuId) && (tornId === "any" || p.tornId === tornId));
      series = new Float64Array(days);
      for (let tt = 0; tt < days; tt++) {
        let s = 0;
        for (const p of members) s += theta[at(p.idx, d - 1, tt)]!;
        series[tt] = members.length ? s / members.length : NaN;
      }
      meanCache.set(k, series);
    }
    return series[clamp(t, 0, days - 1)]!;
  }

  function answer(r: Rng, person: Person, item: WorldItem, t: number) {
    const th = theta[at(person.idx, item.domainId - 1, clamp(t, 0, days - 1))]!;
    const x = th + item.bias + (person.manager ? managerBias : 0) + answerNoise[item.type] * normal(r);
    let valorNum: number;
    let score: number;
    switch (item.type) {
      case "scale10": {
        const s = clamp(Math.round(10 * x), 0, 10) / 10;
        score = s;
        valorNum = item.polarity === 1 ? Math.round(10 * s) : Math.round(10 * (1 - s));
        break;
      }
      case "scale5": {
        const s = clamp(Math.round(4 * x), 0, 4) / 4;
        score = s;
        valorNum = 1 + (item.polarity === 1 ? Math.round(4 * s) : Math.round(4 * (1 - s)));
        break;
      }
      case "yes_no": {
        const yes = r() < clamp(x, 0.01, 0.99) ? 1 : 0;
        score = yes;
        valorNum = item.polarity === 1 ? yes : 1 - yes;
        break;
      }
      case "pair":
      case "choice": {
        const opts = item.options!;
        let best = 0;
        for (let i = 1; i < opts.length; i++) if (Math.abs(opts[i]!.score - x) < Math.abs(opts[best]!.score - x)) best = i;
        valorNum = best;
        score = opts[best]!.score;
        break;
      }
    }
    // Answer time: mostly careful (2-9 s), sometimes a rushed tap.
    const answerMs = r() < 0.08 ? 400 + Math.floor(r() * 900) : Math.round(2000 * Math.exp(0.6 * normal(r)) + 1500);
    return { valorNum, score, answerMs };
  }

  return {
    seed,
    start,
    days,
    dates,
    collectives,
    people,
    accounts,
    items,
    segmentSignals,
    personalDrops,
    managerBias,
    answerNoise,
    level: (p, d, t) => theta[at(p, d - 1, clamp(t, 0, days - 1))]!,
    trueMean,
    answer,
  };
}

