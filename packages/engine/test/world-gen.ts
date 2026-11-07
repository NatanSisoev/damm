// Random small worlds for property-based tests. Everything derives from a seed (src/rng.ts), no dependencies.
import { createEngine, type Engine } from "../src/engine.ts";
import { createRng, type Rng } from "../src/rng.ts";
import { all } from "../src/db.ts";
import type { SqlDatabase } from "../src/db.ts";
import { setFormatPreference } from "../src/hr.ts";
import { addQuestion, DAY_MS, identity, makeDb } from "./helpers.ts";

export type TestDb = SqlDatabase & { close(): void };

export interface GenOptions {
  accountsPerCollective?: number;
  days?: number;
  /** Probability that an account answers on a given day. */
  participation?: number;
  /** Probability that a submitted answer is deliberately malformed. */
  junk?: number;
  start?: number;
  banFormat?: boolean;
  withComments?: boolean;
  /** Give accounts long, unmistakable ids and usernames so tests can grep for leaks. */
  distinctiveIds?: boolean;
}

export interface World {
  db: TestDb;
  engine: Engine;
  clock: { now: number };
  accounts: string[];
  /** Formats banned (preference 0) for collective 1 and 2. */
  banned: Map<number, string[]>;
  /** All batches handed out: account, day, question ids. */
  batches: { account: string; day: string; items: { questionId: number; type: string }[] }[];
  rng: Rng;
}

const START = Date.UTC(2026, 7, 3, 9, 0, 0); // 2026-08-03

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Adds a random pool: 2-4 items per domain across all formats. */
export function addRandomPool(db: SqlDatabase, rng: Rng): void {
  for (let d = 1; d <= 6; d++) {
    const facets = randInt(rng, 2, 3);
    for (let f = 0; f < facets; f++) {
      const facet = `d${d}f${f}`;
      addQuestion(db, { domain: d, type: "scale10", facet, polarity: rng() < 0.2 ? -1 : 1 });
      addQuestion(db, { domain: d, type: "scale5", facet, polarity: rng() < 0.2 ? -1 : 1 });
      if (rng() < 0.7) addQuestion(db, { domain: d, type: "yes_no", facet });
      if (rng() < 0.5)
        addQuestion(db, { domain: d, type: "pair", facet, options: [{ label: "a", score: 0 }, { label: "b", score: 1 }] });
      if (rng() < 0.5)
        addQuestion(db, { domain: d, type: "choice", facet, options: [{ label: "a", score: 0.1 }, { label: "b", score: 0.5 }, { label: "c", score: 0.9 }] });
    }
    if (rng() < 0.3) addQuestion(db, { domain: d, type: "scale10", facet: `d${d}fu`, followup: true });
  }
  if (rng() < 0.7)
    addQuestion(db, {
      domain: 1,
      type: "ranking",
      facet: "importance",
      options: [1, 2, 3, 4].map((d) => ({ label: `o${d}`, domain_id: d })),
    });
}

/** A valid random answer for a batch item (or a malformed one when `junk`). */
export function randomAnswer(
  rng: Rng,
  item: { questionId: number; type: string; options: { label: string }[] | null },
  junk: boolean,
  withComments: boolean,
) {
  const base: Record<string, unknown> = { preguntaId: item.questionId, answerMs: 2000 + Math.floor(rng() * 5000) };
  if (withComments && rng() < 0.2) base.comentari = rng() < 0.5 ? "mail me ana@example.com about shifts" : "the break room is too hot";
  const k = item.options?.length ?? 0;
  if (junk) {
    const kinds = [{ valorNum: Number.NaN }, { valorNum: 1e12 }, { valorNum: -3 }, { valorNum: "7" }, { valorNum: 2.5 }, { valueJson: [0, 0, 1] }, {}];
    return { ...base, ...kinds[Math.floor(rng() * kinds.length)] };
  }
  switch (item.type) {
    case "scale10":
      return { ...base, valorNum: randInt(rng, 0, 10) };
    case "scale5":
      return { ...base, valorNum: randInt(rng, 1, 5) };
    case "yes_no":
      return { ...base, valorNum: randInt(rng, 0, 1) };
    case "pair":
    case "choice":
      return { ...base, valorNum: randInt(rng, 0, k - 1) };
    case "ranking": {
      const order = [...Array(k).keys()];
      for (let i = k - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      return { ...base, valueJson: order };
    }
    default:
      return { ...base, comentari: "free text" };
  }
}

/** Builds a random world and drives it through `days` days of batches and answers. */
export function generateWorld(seed: string, o: GenOptions = {}): World {
  const rng = createRng(`world|${seed}`);
  const db = makeDb({ accountsPerCollective: o.accountsPerCollective ?? randInt(rng, 4, 26) }) as TestDb;
  if (o.distinctiveIds) db.exec("UPDATE compte SET id = 'acct_' || id || '_zq7k', username = 'user_' || username || '_wx3p'");
  addRandomPool(db, rng);
  const banned = new Map<number, string[]>();
  if (o.banFormat ?? rng() < 0.5) {
    setFormatPreference(db, { collectiuId: 1, type: "yes_no", weight: 0 });
    setFormatPreference(db, { collectiuId: 2, type: "pair", weight: 0 });
    banned.set(1, ["yes_no"]);
    banned.set(2, ["pair"]);
  }
  const clock = { now: o.start ?? START };
  const engine = createEngine({ db, redact: (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"), now: () => clock.now });
  const accounts = all<{ id: string }>(db, "SELECT id FROM compte ORDER BY id").map((a) => a.id);
  const world: World = { db, engine, clock, accounts, banned, batches: [], rng };
  const days = o.days ?? randInt(rng, 12, 40);
  const participation = o.participation ?? 0.4 + rng() * 0.5;
  for (let d = 0; d < days; d++) {
    driveDay(world, participation, o.junk ?? 0.03, o.withComments ?? true);
    clock.now += DAY_MS;
  }
  return world;
}

/** One day: every account that "shows up" fetches its batch and answers (some or all items). */
export function driveDay(w: World, participation: number, junk: number, withComments: boolean): void {
  for (const a of w.accounts) {
    if (w.rng() >= participation) continue;
    const batch = w.engine.getDailyBatch(a);
    w.batches.push({ account: a, day: batch.day, items: batch.items.map((i) => ({ questionId: i.questionId, type: i.type })) });
    const answers = batch.items
      .filter(() => w.rng() < 0.9)
      .map((i) => randomAnswer(w.rng, i, w.rng() < junk, withComments));
    w.engine.submitAnswers(a, answers as never);
  }
}

export { identity };
