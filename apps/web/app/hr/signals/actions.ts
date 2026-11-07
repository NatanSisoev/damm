"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDraftedFollowUp } from "../follow-up";

/** AI drafts the follow-up questions for an approved recommendation; a person reviews them on /hr/review before anything is published. */
export async function proposeFollowUpAction(formData: FormData) {
  await createDraftedFollowUp(Number(formData.get("rec")));
  revalidatePath("/hr", "layout");
  redirect("/hr/review");
}
