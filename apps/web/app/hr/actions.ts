"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveQuestion, approveRecommendation, createFollowUp, createNecessitat, discardQuestion,
  discardRecommendation, publishNecessitat, updateDraftText,
} from "@damm/db/hr";

const HR_USER = "hr-demo"; // no auth in the prototype; approval is still an explicit human action

export async function createNeedAction(formData: FormData) {
  const textNl = String(formData.get("text_nl") ?? "").trim();
  if (!textNl) return;
  const c = Number(formData.get("collectiu"));
  const d = Number(formData.get("durada"));
  createNecessitat({ textNl, collectiuId: c > 0 ? c : null, duradaMaxS: d > 0 ? d : null });
  redirect("/hr/review");
}

export async function approveQuestionAction(formData: FormData) {
  approveQuestion(Number(formData.get("id")), HR_USER);
  revalidatePath("/hr/review");
}

export async function discardQuestionAction(formData: FormData) {
  discardQuestion(Number(formData.get("id")));
  revalidatePath("/hr/review");
}

export async function editQuestionAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (text) updateDraftText(Number(formData.get("id")), text);
  revalidatePath("/hr/review");
}

export async function publishAction(formData: FormData) {
  publishNecessitat(Number(formData.get("id")), process.env.PUBLIC_BASE_URL ?? "http://localhost:3000");
  revalidatePath("/hr/review");
}

export async function approveRecommendationAction(formData: FormData) {
  approveRecommendation(Number(formData.get("id")));
  revalidatePath("/hr/recommendations");
}

export async function discardRecommendationAction(formData: FormData) {
  discardRecommendation(Number(formData.get("id")));
  revalidatePath("/hr/recommendations");
}

export async function followUpAction(formData: FormData) {
  createFollowUp(Number(formData.get("id")));
  revalidatePath("/hr/recommendations");
  redirect("/hr/review");
}
