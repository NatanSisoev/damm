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
import { notifyNeedPublished } from "@/lib/push";

const HR_USER = "hr-demo"; // no auth in the prototype; approval is still an explicit human action

export type NeedFormState = { error: string; field?: "text_nl" | "durada" } | null;

/** Creates a need and its AI drafts. Returns an error state (never fails silently); redirects on success. */
export async function createNeedAction(_prev: NeedFormState, formData: FormData): Promise<NeedFormState> {
  const textNl = String(formData.get("text_nl") ?? "").trim();
  if (!textNl) return { error: "Escriu l'objectiu de la consulta abans de generar els esborranys.", field: "text_nl" };
  if (textNl.length < 15) return { error: "L'objectiu és massa curt perquè la IA el pugui treballar. Explica què vols entendre i de qui.", field: "text_nl" };
  const c = Number(formData.get("collectiu"));
  const d = Number(formData.get("durada"));
  if (!Number.isFinite(d) || d < 30) return { error: "La durada màxima ha de ser d'almenys 30 segons.", field: "durada" };
  const context = String(formData.get("context") ?? "").trim();
  const exclusions = String(formData.get("exclusions") ?? "").trim();
  const collectiuId = c > 0 ? c : null;
  const duradaMaxS = d;
  try {
    const collective = collectiuId ? listCollectius().find((x) => x.id === collectiuId)?.nom ?? null : null;
    // AI proposes: drafts only, nothing is approved here. Draft first so a failure leaves no orphan need to retry over.
    const survey = await draftSurvey({ objective: textNl, context, exclusions, collective, maxSeconds: duradaMaxS });
    const id = createNecessitat({ textNl, collectiuId, duradaMaxS, context, exclusions });
    saveDraftSurvey(id, survey);
  } catch (err) {
    console.error("createNeedAction", err);
    return { error: "No s'han pogut generar els esborranys (la IA o la base de dades no han respost). No s'ha desat res: torna-ho a provar." };
  }
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

/**
 * Publish: the approved questions go live in the pool for the need's collective, then every
 * subscribed device in that collective gets a push notification. HR passes only the need id and
 * gets back an aggregate count (shown as "<10" under the minimum group size).
 */
export async function publishAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!publishNecessitat(id)) redirect("/hr/needs");
  const outcome = await notifyNeedPublished(id);
  revalidatePath("/hr/needs");
  revalidatePath("/hr/review");
  const avis = outcome.status === "off" ? "off" : String(outcome.devices);
  redirect(`/hr/needs?publicada=${id}&avis=${encodeURIComponent(avis)}`);
}

export async function approveRecommendationAction(formData: FormData) {
  approveRecommendation(Number(formData.get("id")));
  revalidatePath("/hr", "layout");
}

export async function discardRecommendationAction(formData: FormData) {
  discardRecommendation(Number(formData.get("id")));
  revalidatePath("/hr", "layout");
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
