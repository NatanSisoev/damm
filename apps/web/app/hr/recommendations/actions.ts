"use server";

import { revalidatePath } from "next/cache";
import { approveRecommendation, discardRecommendation } from "@damm/db/hr";
import { createDraftedFollowUp } from "../follow-up";

// Same human decisions as the list page, but they stay on the recommendation's own page.
function refresh(id: number) {
  revalidatePath(`/hr/recommendations/${id}`);
  revalidatePath("/hr/recommendations");
  revalidatePath("/hr", "layout");
}

export async function approveFromDetailAction(formData: FormData) {
  const id = Number(formData.get("id"));
  approveRecommendation(id);
  refresh(id);
}

export async function discardFromDetailAction(formData: FormData) {
  const id = Number(formData.get("id"));
  discardRecommendation(id);
  refresh(id);
}

export async function followUpFromDetailAction(formData: FormData) {
  const id = Number(formData.get("id"));
  await createDraftedFollowUp(id);
  refresh(id);
}
