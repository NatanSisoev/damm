"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@damm/db";
import { runRecommendations } from "@damm/engine/job";
import { draftRecommendations } from "@damm/ai";
import { createDraftedFollowUp } from "../follow-up";

type EngineDb = Parameters<typeof runRecommendations>[0];

/** Drafts 1 to 3 recommendation proposals for one alarm (LLM when configured, template library otherwise). A person still approves them. */
export async function generateRecommendationsAction(formData: FormData) {
  const id = Number(formData.get("signal"));
  if (Number.isInteger(id) && id > 0) {
    await runRecommendations(getDb() as unknown as EngineDb, { now: Date.now(), alarmId: id, draft: (ctx) => draftRecommendations(ctx) });
    revalidatePath(`/hr/signals/${id}`);
  }
  revalidatePath("/hr", "layout");
  redirect(`/hr/signals/${id}#recomanacions`);
}

/** AI drafts the follow-up questions for an approved recommendation; a person reviews them on /hr/review before anything is published. */
export async function proposeFollowUpAction(formData: FormData) {
  await createDraftedFollowUp(Number(formData.get("rec")));
  revalidatePath("/hr", "layout");
  redirect("/hr/review");
}
