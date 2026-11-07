// One learning step for a closed answer: shared by live submission and by the job's replay,
// so both always produce the same state. Pure.
import type { ClosedType, EngineConfig } from "./config.ts";
import { updateItemStats, type ItemStats } from "./item-bias.ts";
import type { QuestionDef } from "./normalize.ts";
import { newPersonState, observe, type FollowupOutcome, type PersonDomainState } from "./person.ts";
import type { Rng } from "./rng.ts";

export interface LearnInput {
  person: PersonDomainState | null;
  item: ItemStats;
  question: QuestionDef;
  score: number;
  at: string;
  day: string;
  isFollowup: boolean;
}

export interface LearnOutput {
  person: PersonDomainState;
  item: ItemStats;
  z: number;
  followup: FollowupOutcome;
}

export function priorLevel(cfg: EngineConfig, domainId: number): number {
  return cfg.priors.domainLevel[String(domainId)] ?? cfg.priors.level;
}

export function learn(input: LearnInput, cfg: EngineConfig, rng: Rng): LearnOutput {
  const type = input.question.type as ClosedType;
  const prev = input.person ?? newPersonState(priorLevel(cfg, input.question.domainId), cfg, input.at);
  // Residual against the level before this answer feeds the item's wording bias.
  const item = updateItemStats(input.item, input.score - prev.level, cfg.itemBiasShrinkage);
  const { state, z, followup } = observe(
    prev,
    {
      y: input.score - input.item.bias,
      noiseSd: cfg.noiseSd[type],
      at: input.at,
      day: input.day,
      isFollowup: input.isFollowup,
      canTriggerFollowup: cfg.followupTriggerTypes.includes(type),
    },
    cfg,
    rng,
  );
  return { person: state, item, z, followup };
}

export const isClosed = (t: QuestionDef["type"]): t is ClosedType => t !== "ranking" && t !== "open";
