"use server";

import { revalidatePath } from "next/cache";
import { approveRecommendation, discardRecommendation } from "@damm/db/hr";
import { createDraftedFollowUp } from "../../follow-up";

// Same human actions as the recommendations page; they only revalidate the signal page too.
function refresh(formData: FormData) {
  const signalId = Number(formData.get("signal"));
  if (signalId > 0) revalidatePath(`/hr/signals/${signalId}`);
  revalidatePath("/hr/recommendations");
}

export async function approveFromSignalAction(formData: FormData) {
  approveRecommendation(Number(formData.get("id")));
  refresh(formData);
}

export async function discardFromSignalAction(formData: FormData) {
  discardRecommendation(Number(formData.get("id")));
  refresh(formData);
}

export async function followUpFromSignalAction(formData: FormData) {
  await createDraftedFollowUp(Number(formData.get("id")));
  refresh(formData);
}
