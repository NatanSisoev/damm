"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftSurvey, redraftQuestion } from "@damm/ai";
import {
  approveQuestion, getRedraftContext, listCollectius, moveDraft, replaceDraft, saveDraftSurvey, updateNeedHeader, approveRecommendation, createNecessitat, discardQuestion,
  discardRecommendation, publishNecessitat, updateDraftText, closeNecessitat, setSignalStatus,
} from "@damm/db/hr";
import { createDraftedFollowUp } from "./follow-up";
import { changeAlarmStatus, type AlarmStatus } from "@/lib/hr-engine";

const HR_USER = "hr-demo"; // no auth in the prototype; approval is still an explicit human action

export async function createNeedAction(formData: FormData) {
  const textNl = String(formData.get("text_nl") ?? "").trim();
  if (!textNl) return;
  const c = Number(formData.get("collectiu"));
  const d = Number(formData.get("durada"));
  const context = String(formData.get("context") ?? "").trim();
  const exclusions = String(formData.get("exclusions") ?? "").trim();
  const collectiuId = c > 0 ? c : null;
  const duradaMaxS = d > 0 ? d : null;
  const id = createNecessitat({ textNl, collectiuId, duradaMaxS, context, exclusions });
  const collective = collectiuId ? listCollectius().find((x) => x.id === collectiuId)?.nom ?? null : null;
  // AI proposes: drafts only, nothing is approved here. draftSurvey never throws (it falls back to a template).
  const survey = await draftSurvey({ objective: textNl, context, exclusions, collective, maxSeconds: duradaMaxS });
  saveDraftSurvey(id, survey);
  redirect("/hr/review");
}

export async function moveDraftAction(formData: FormData) {
  moveDraft(Number(formData.get("id")), formData.get("dir") === "up" ? "up" : "down");
  revalidatePath("/hr/review");
}

export async function regenerateQuestionAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const ctx = getRedraftContext(id);
  if (!ctx) return;
  const r = await redraftQuestion(ctx.need, ctx.current as never, ctx.others as never);
  if (r) replaceDraft(id, r.question, r.source === "llm");
  revalidatePath("/hr/review");
}

export async function editNeedHeaderAction(formData: FormData) {
  const titol = String(formData.get("titol") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (titol) updateNeedHeader(Number(formData.get("id")), titol, intro);
  revalidatePath("/hr/review");
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
  await createDraftedFollowUp(Number(formData.get("id")));
  revalidatePath("/hr/recommendations");
  redirect("/hr/review");
}

export async function closeNeedAction(formData: FormData) {
  closeNecessitat(Number(formData.get("id")));
  revalidatePath("/hr", "layout");
}

export async function setSignalStatusAction(formData: FormData) {
  const id = Number(formData.get("id"));
  setSignalStatus(id, String(formData.get("status") ?? ""));
  revalidatePath("/hr", "layout");
}

export async function setAlarmStatusAction(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (!["acknowledged", "action_linked", "resolved"].includes(status)) return;
  try {
    changeAlarmStatus(Number(formData.get("id")), status as AlarmStatus);
  } catch {
    // invalid transition (stale page): just refresh
  }
  revalidatePath("/hr", "layout");
}

export async function recomputeAction() {
  const { getScheduler } = await import("@/lib/engine");
  await getScheduler().runNow();
  revalidatePath("/hr", "layout");
}
