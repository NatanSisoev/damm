// Drafts recommendation proposals for one alarm. Lives outside app/hr so HR pages never touch the DB handle or the engine job
// (anonymity boundary): HR code calls this one function, which reads aggregates only and writes `recomanacio` proposals.
import { getDb } from "@damm/db";
import { runRecommendations } from "@damm/engine/job";
import { draftRecommendations } from "@damm/ai";

type EngineDb = Parameters<typeof runRecommendations>[0];

/** 1 to 3 proposals for one alarm (LLM when configured, template library otherwise). A person still approves them. */
export async function generateRecommendationsFor(alarmId: number): Promise<void> {
  await runRecommendations(getDb() as unknown as EngineDb, { now: Date.now(), alarmId, draft: (ctx) => draftRecommendations(ctx) });
}
