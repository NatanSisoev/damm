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

export function selectBatch(input: BatchInput): BatchPick[] {
  const { cfg, rng, day } = input;
  const picks: BatchPick[] = [];
  const used = new Set<number>();
  const slots = cfg.questionsPerDay;
  const cooldownStart = addDays(day, -cfg.itemCooldownDays);
  const allowed = (q: QuestionDef) => !used.has(q.id) && input.formatPref(q.type) > 0;
  const add = (q: QuestionDef, reason: AssignmentReason) => {
    picks.push({ question: q, reason });
    used.add(q.id);
  };

  // 1. One due follow-up: prefer follow-up wordings in the domain, else a fresh monitoring item there.
  for (const domainId of input.dueFollowups) {
    if (picks.length >= Math.min(1, slots)) break;
    const inDomain = input.questions.filter((q) => q.domainId === domainId && q.needId === null && allowed(q));
    const fu = inDomain.filter((q) => q.isFollowup);
    const q = fu.length ? pickFresh(fu, input, rng) : pickInDomain(inDomain.filter((x) => !x.isFollowup), input, cooldownStart);
    if (q) add(q, "followup");
  }

  // 2. HR needs: highest priority first, each asked once per person.
  const needs = input.questions
    .filter((q) => q.needId !== null && !q.isFollowup && !input.answered.has(q.id) && allowed(q))
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
  for (const q of needs.slice(0, cfg.maxNeedsPerDay)) if (picks.length < slots) add(q, "need");

  // 3. Monitoring: domains drawn ∝ priority without replacement, one item per domain.
  const maxGain = Math.max(0, ...input.domains.map((d) => d.infoGain));
  const order = weightedSampleWithoutReplacement(
    rng,
    input.domains.map((d) => ({ key: d.domainId, weight: domainPriority(d, maxGain, cfg) })),
    input.domains.length,
  );
  const monitoring = input.questions.filter((q) => q.needId === null && !q.isFollowup);
  for (const domainId of order) {
    if (picks.length >= slots) break;
    const q = pickInDomain(monitoring.filter((x) => x.domainId === domainId && allowed(x)), input, cooldownStart);
    if (q) add(q, "monitor");
  }
  // Pool too small for one-per-domain: fill with any remaining monitoring item, oldest seen first.
  for (const q of [...monitoring].sort((a, b) => seen(input, a).localeCompare(seen(input, b)))) {
    if (picks.length >= slots) break;
    if (allowed(q)) add(q, "monitor");
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
