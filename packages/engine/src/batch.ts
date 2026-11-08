// Daily batch selection. docs/engine.md section 5. Pure: everything it needs is passed in.
import type { QuestionType } from "@damm/shared";
import type { EngineConfig } from "./config.ts";
import type { QuestionDef } from "./normalize.ts";
import { pick, weightedSampleWithoutReplacement, type Rng } from "./rng.ts";
import { chooseFormat, type FormatArm } from "./thompson.ts";
import { addDays } from "./time.ts";
import type { AssignmentReason } from "@damm/shared";

export interface DomainSignal {
  domainId: number;
  /** Expected SE² reduction from one more answer in the person's segment. */
  infoGain: number;
  /** Share of recent personal |z| ≥ outlierZ in the segment for this domain (0..1). */
  outlierShare: number;
  /** HR weight for this collective × domain. */
  weight: number;
  /** Active "Indagar" probe multiplier for this person's segment and domain (absent or 1 = none). */
  probeBoost?: number;
}

export interface BatchInput {
  cfg: EngineConfig;
  rng: Rng;
  day: string;
  /** Approved questions eligible for this person's collective. */
  questions: QuestionDef[];
  /** questionId → last day it was shown to or answered by this person. */
  lastSeen: Map<number, string>;
  /** Questions this person has ever answered (HR needs are asked once). */
  answered: Set<number>;
  /** Domains with a follow-up due today or earlier. */
  dueFollowups: number[];
  domains: DomainSignal[];
  /** HR format preference for this collective (0 = banned). */
  formatPref: (t: QuestionType) => number;
  /** Thompson arms for this collective × shift. */
  formatStats: (t: QuestionType) => { alpha: number; beta: number };
}

export interface BatchPick {
  question: QuestionDef;
  reason: AssignmentReason;
}

/** Share of |z| ≥ 2 expected under a normal model. Outlier boost uses the excess over this. */
const EXPECTED_OUTLIER_SHARE = 0.0455;

/** Extra format preference for `open` items in a probed domain. */
export const PROBE_OPEN_PREF = 2;

export function domainPriority(d: DomainSignal, maxGain: number, cfg: EngineConfig): number {
  const gain = maxGain > 0 ? d.infoGain / maxGain : 0;
  const excess = Math.min(3, Math.max(0, d.outlierShare / EXPECTED_OUTLIER_SHARE - 1));
  return d.weight * (d.probeBoost ?? 1) * (gain + cfg.domainFloor) * (1 + cfg.outlierBoost * excess);
}

/** Types that never go in the daily batch: free text is an optional comment on other questions, not an item. */
export const BATCH_EXCLUDED_TYPES: QuestionType[] = ["open"];

/**
 * Daily batch: at most `questionsPerDay` questions, all of ONE answer type.
 * 1. The day's type is fixed first: the top-priority published HR need decides it (needs come first),
 *    else a due follow-up, else Thompson sampling over the types that can fill the day.
 * 2. Slots are then filled with same-type items: the follow-up (if its type matches), the need(s),
 *    and monitoring items by domain priority. Fewer than the cap only when the pool truly has no more
 *    items of that type; the types are never mixed. Nothing is added on top of the cap.
 */
export function selectBatch(input: BatchInput): BatchPick[] {
  const { cfg, rng, day } = input;
  const picks: BatchPick[] = [];
  const used = new Set<number>();
  const slots = cfg.questionsPerDay;
  const cooldownStart = addDays(day, -cfg.itemCooldownDays);
  const base = (q: QuestionDef) => !used.has(q.id) && !BATCH_EXCLUDED_TYPES.includes(q.type) && input.formatPref(q.type) > 0;
  const add = (q: QuestionDef, reason: AssignmentReason) => {
    picks.push({ question: q, reason });
    used.add(q.id);
  };

  // HR needs: highest priority first, each asked once per person.
  const needs = input.questions
    .filter((q) => q.needId !== null && !q.isFollowup && !input.answered.has(q.id) && base(q))
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
  const monitoring = input.questions.filter((q) => q.needId === null && !q.isFollowup && base(q));

  // Follow-up candidate: one due domain, follow-up wordings first, else a fresh monitoring item there.
  const followupCandidates: QuestionDef[] = [];
  for (const domainId of input.dueFollowups) {
    const inDomain = monitoring.filter((q) => q.domainId === domainId);
    const fu = input.questions.filter((q) => q.domainId === domainId && q.needId === null && q.isFollowup && base(q));
    const q = fu.length ? pickFresh(fu, input, rng) : pickInDomain(inDomain, input, cooldownStart);
    if (q) followupCandidates.push(q);
  }

  // Day type.
  const typeCount = new Map<QuestionType, number>();
  for (const q of monitoring) typeCount.set(q.type, (typeCount.get(q.type) ?? 0) + 1);
  let dayType: QuestionType | undefined = needs[0]?.type ?? followupCandidates[0]?.type;
  if (!dayType) {
    const types = [...typeCount.keys()].sort();
    const full = types.filter((t) => (typeCount.get(t) ?? 0) >= slots);
    const among = full.length ? full : types.filter((t) => (typeCount.get(t) ?? 0) === Math.max(0, ...typeCount.values()));
    dayType = chooseFormat(rng, among.map((t) => ({ type: t, ...input.formatStats(t), pref: input.formatPref(t) })));
  }
  if (!dayType) return picks;
  const same = (q: QuestionDef) => q.type === dayType;

  // 1. One due follow-up of the day's type (otherwise it stays due for another day).
  const fu = followupCandidates.find(same);
  if (fu && slots > 0 && (needs.length === 0 || needs[0]!.type === dayType)) add(fu, "followup");

  // 2. HR needs of the day's type.
  let taken = 0;
  for (const q of needs.filter(same)) {
    if (taken >= cfg.maxNeedsPerDay || picks.length >= slots) break;
    if (!used.has(q.id)) {
      add(q, "need");
      taken++;
    }
  }

  // 3. Monitoring of the day's type: domains drawn ∝ priority without replacement, one item per domain.
  const maxGain = Math.max(0, ...input.domains.map((d) => d.infoGain));
  const order = weightedSampleWithoutReplacement(
    rng,
    input.domains.map((d) => ({ key: d.domainId, weight: domainPriority(d, maxGain, cfg) })),
    input.domains.length,
  );
  const mon = monitoring.filter(same);
  for (const domainId of order) {
    if (picks.length >= slots) break;
    const q = pickInDomain(mon.filter((x) => x.domainId === domainId && !used.has(x.id)), input, cooldownStart);
    if (q) add(q, "monitor");
  }
  // Fewer same-type domains than slots: fill with any remaining same-type item, oldest seen first.
  for (const q of [...mon].sort((a, b) => seen(input, a).localeCompare(seen(input, b)) || a.id - b.id)) {
    if (picks.length >= slots) break;
    if (!used.has(q.id)) add(q, "monitor");
  }
  return picks;
}

const seen = (input: BatchInput, q: QuestionDef) => input.lastSeen.get(q.id) ?? "0000-00-00";

/** Facet this person has gone longest without, then a format by Thompson sampling, then an item. */
function pickInDomain(candidates: QuestionDef[], input: BatchInput, cooldownStart: string): QuestionDef | undefined {
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((q) => seen(input, q) < cooldownStart);
  const pool = fresh.length ? fresh : candidates; // never leave a slot empty because of the cooldown
  const facetLast = new Map<string, string>();
  for (const q of candidates) {
    const s = seen(input, q);
    if (s > (facetLast.get(q.facet) ?? "0000-00-00")) facetLast.set(q.facet, s);
  }
  const facets = [...new Set(pool.map((q) => q.facet))];
  const stalest = facets.reduce((a, b) => ((facetLast.get(a) ?? "0000-00-00") <= (facetLast.get(b) ?? "0000-00-00") ? a : b));
  const tied = facets.filter((f) => (facetLast.get(f) ?? "0000-00-00") === (facetLast.get(stalest) ?? "0000-00-00"));
  const facet = pick(input.rng, tied.sort())!;
  const items = pool.filter((q) => q.facet === facet);
  const types = [...new Set(items.map((q) => q.type))].sort();
  // Probed domain: lean towards formats that carry an open comment prompt, since the point is to hear why.
  const probed = (input.domains.find((d) => d.domainId === candidates[0]!.domainId)?.probeBoost ?? 1) > 1;
  const arms: FormatArm[] = types.map((t) => ({ type: t, ...input.formatStats(t), pref: input.formatPref(t) * (probed && t === "open" ? PROBE_OPEN_PREF : 1) }));
  const type = chooseFormat(input.rng, arms);
  return pick(input.rng, items.filter((q) => q.type === type).sort((a, b) => a.id - b.id));
}

function pickFresh(items: QuestionDef[], input: BatchInput, rng: Rng): QuestionDef | undefined {
  const oldest = [...items].sort((a, b) => seen(input, a).localeCompare(seen(input, b)) || a.id - b.id);
  const s = oldest[0] ? seen(input, oldest[0]) : undefined;
  return pick(rng, oldest.filter((q) => seen(input, q) === s));
}
