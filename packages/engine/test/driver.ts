// Drives an engine through simulated days with controllable sentiment: used by the soak and performance tests.
import type { BatchItem, Engine } from "../src/engine.ts";
import type { Rng } from "../src/rng.ts";
import { DAY_MS } from "./helpers.ts";

/** Answer to a batch item aiming at a satisfaction level `s` in 0..1 (pair/choice/ranking cannot be aimed: random). */
export function answerFor(item: BatchItem, s: number, rng: Rng) {
  const base = { preguntaId: item.questionId, answerMs: 2500 + Math.floor(rng() * 4000) };
  const level = Math.min(1, Math.max(0, s));
  switch (item.type) {
    case "scale10":
      return { ...base, valorNum: Math.round(level * 10) };
    case "scale5":
      return { ...base, valorNum: 1 + Math.round(level * 4) };
    case "yes_no":
      return { ...base, valorNum: rng() < level ? 1 : 0 };
    case "pair":
    case "choice":
      return { ...base, valorNum: Math.floor(rng() * (item.options?.length ?? 1)) };
    case "ranking": {
      const order = [...Array(item.options?.length ?? 0).keys()];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      return { ...base, valueJson: order };
    }
    default:
      return { ...base, comentari: "the schedule changed again" };
  }
}

export interface Person {
  id: string;
  /** Personal baseline 0..1. */
  base: number;
  collectiu: number;
}

/** Satisfaction for (person, domain, day index). The tests plant their stories here. */
export type Sentiment = (p: Person, domainId: number, dayIndex: number) => number;

export function answerDay(engine: Engine, people: Person[], sentiment: Sentiment, dayIndex: number, rng: Rng, participation: number) {
  let answers = 0;
  for (const p of people) {
    if (rng() >= participation) continue;
    const batch = engine.getDailyBatch(p.id);
    const todo = batch.items.filter((i) => !i.answered).map((i) => answerFor(i, sentiment(p, i.domainId, dayIndex) + (rng() - 0.5) * 0.15, rng));
    answers += engine.submitAnswers(p.id, todo as never).accepted.length;
  }
  return answers;
}

export { DAY_MS };
