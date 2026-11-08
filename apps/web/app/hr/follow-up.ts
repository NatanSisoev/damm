// Server-side only: imported from "use server" action files.
import { draftSurvey } from "@damm/ai";
import type { QueryDelivery } from "@damm/shared";
import { createFollowUp, linkSignalOfRecommendation, saveDraftSurvey } from "@damm/db/hr";

/**
 * Create the follow-up need for an approved recommendation and let the AI draft its questions.
 * `delivery` is the same daily / one-time choice as for a new query. The drafts still go through human review before they enter the pool. draftSurvey never throws.
 */
export async function createDraftedFollowUp(recId: number, delivery: QueryDelivery): Promise<void> {
  const need = createFollowUp(recId, delivery);
  if (!need) return;
  linkSignalOfRecommendation(recId);
  const survey = await draftSurvey({
    objective: need.objective,
    context: need.context,
    collective: need.collective,
    maxSeconds: need.maxSeconds,
  });
  saveDraftSurvey(need.id, survey);
}
