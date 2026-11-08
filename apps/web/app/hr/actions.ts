"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftSurvey, redraftQuestion, translateQuestionTexts } from "@damm/ai";
import { DEFAULT_QUESTION_COUNT, QUESTION_COUNT_OPTIONS, type QueryDelivery } from "@damm/shared";
import {
  approveQuestion, fillQuestionTranslations, getDraftFollowup, removeDraftFollowup, getQuestionWording, getRedraftContext, listCollectius, listNeedCards, moveDraft, replaceDraft, saveDraftSurvey, updateNeedHeader, approveRecommendation, createNecessitat, discardQuestion,
  discardRecommendation, publishNecessitat, updateDraftText, closeNecessitat, setSignalStatus, setAlarmArchived, reopenClosedAlarm,
  recordDecision, alarmInfo, questionInfo,
} from "@damm/db/hr";
import { createDraftedFollowUp } from "./follow-up";
import { changeAlarmStatus, hrSetQuestionActive, invalidateHrPool, type AlarmStatus } from "@/lib/hr-engine";
import { notifyNeedPublished } from "@/lib/push";
import { invalidateHrMemo } from "@/lib/hr-memo";
import { getT } from "@/lib/i18n/server";
import { panelDict } from "@/lib/i18n/hr-panel";

const HR_USER = "hr-demo"; // no auth in the prototype; approval is still an explicit human action

export type NeedFormState = { error: string; field?: "text_nl" } | null;

/** Creates a need and its AI drafts. Returns an error state (never fails silently); redirects on success. */
export async function createNeedAction(_prev: NeedFormState, formData: FormData): Promise<NeedFormState> {
  const t = await getT(panelDict);
  const textNl = String(formData.get("text_nl") ?? "").trim();
  if (!textNl) return { error: t("need_err_empty"), field: "text_nl" };
  if (textNl.length < 15) return { error: t("need_err_short"), field: "text_nl" };
  const c = Number(formData.get("collectiu"));
  // Number of questions per person and delivery mode (daily set or one-off campaign); anything else falls back to the defaults.
  const qc = Number(formData.get("question_count"));
  const questionCount = (QUESTION_COUNT_OPTIONS as readonly number[]).includes(qc) ? qc : DEFAULT_QUESTION_COUNT;
  const delivery: QueryDelivery = formData.get("delivery") === "campaign" ? "campaign" : "daily";
  const context = String(formData.get("context") ?? "").trim();
  const exclusions = String(formData.get("exclusions") ?? "").trim();
  const collectiuId = c > 0 ? c : null;
  let id: number;
  try {
    const collective = collectiuId ? listCollectius().find((x) => x.id === collectiuId)?.nom ?? null : null;
    // AI proposes: drafts only, nothing is approved here. Draft first so a failure leaves no orphan need to retry over.
    const survey = await draftSurvey({ objective: textNl, context, exclusions, collective, questionCount });
    id = createNecessitat({ textNl, collectiuId, questionCount, delivery, context, exclusions });
    saveDraftSurvey(id, survey);
  } catch (err) {
    console.error("createNeedAction", err);
    return { error: t("need_err_failed") };
  }
  redirect(`/hr/needs/new?draft=${id}`);
}

export async function moveDraftAction(formData: FormData) {
  moveDraft(Number(formData.get("id")), formData.get("dir") === "up" ? "up" : "down");
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

export async function regenerateQuestionAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const ctx = getRedraftContext(id);
  const r = ctx ? await redraftQuestion(ctx.need, ctx.current as never, ctx.others as never) : null;
  // Drafts are only reviewed on the single-query review page, so a failure comes back there.
  if (!r) redirect(`/hr/needs/new?draft=${Number(formData.get("need")) || ""}&regenError=${id}`);
  replaceDraft(id, r.question, r.source === "llm", HR_USER);
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

export async function editNeedHeaderAction(formData: FormData) {
  const titol = String(formData.get("titol") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  if (titol) updateNeedHeader(Number(formData.get("id")), titol, intro);
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

/** Makes sure a question has es and en wording before it enters the pool. Never throws: a failed call leaves the Catalan text, which readers fall back to. */
async function ensureQuestionTranslations(id: number): Promise<void> {
  try {
    const w = getQuestionWording(id);
    if (!w || (w.es && w.en)) return;
    const tr = await translateQuestionTexts([w.text]);
    if (tr) fillQuestionTranslations(id, tr[0].es, tr[0].en);
  } catch {
    /* approval must never block on translation */
  }
}

export async function approveQuestionAction(formData: FormData) {
  const id = Number(formData.get("id"));
  await ensureQuestionTranslations(id);
  const fu = getDraftFollowup(id);
  if (fu) await ensureQuestionTranslations(fu.id);
  approveQuestion(id, HR_USER);
  invalidateHrPool();
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

export async function removeFollowupAction(formData: FormData) {
  removeDraftFollowup(Number(formData.get("id")), HR_USER);
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

export async function discardQuestionAction(formData: FormData) {
  discardQuestion(Number(formData.get("id")), HR_USER);
  invalidateHrPool();
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

export async function editQuestionAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (text) updateDraftText(Number(formData.get("id")), text, String(formData.get("text_es") ?? ""), String(formData.get("text_en") ?? ""), HR_USER);
  // The review screen re-runs the wording check (questionWarnings) on the saved text, so warnings show right after saving.
  revalidatePath("/hr/review");
  revalidatePath("/hr/needs");
  revalidatePath("/hr/needs/new");
}

/**
 * Publish: the approved questions go live in the pool for the need's collective, then every
 * subscribed device in that collective gets a push notification. HR passes only the need id and
 * gets back an aggregate count (shown as "<10" under the minimum group size).
 */
export async function publishAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!publishNecessitat(id, HR_USER)) redirect("/hr/needs");
  invalidateHrPool();
  const outcome = await notifyNeedPublished(id);
  revalidatePath("/hr/needs");
  revalidatePath("/hr/review");
  const avis = outcome.status === "off" ? "off" : String(outcome.devices);
  redirect(`/hr/needs?publicada=${id}&avis=${encodeURIComponent(avis)}`);
}

/**
 * Reminder for a published need with low participation (R-FLOW-5d): the same web push path as publishing.
 * HR passes only the need id and gets back an aggregate device count ("<10" under the minimum group size).
 */
export async function remindNeedAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const need = listNeedCards().find((n) => n.id === id);
  if (!need || need.state !== "publicada") redirect("/hr/needs");
  const outcome = await notifyNeedPublished(id);
  revalidatePath("/hr/needs");
  const avis = outcome.status === "off" ? "off" : String(outcome.devices);
  redirect(`/hr/needs?recordatori=${id}&avis=${encodeURIComponent(avis)}`);
}

export async function approveRecommendationAction(formData: FormData) {
  approveRecommendation(Number(formData.get("id")), String(formData.get("approver") ?? "") || HR_USER);
  revalidatePath("/hr", "layout");
}

export async function discardRecommendationAction(formData: FormData) {
  discardRecommendation(Number(formData.get("id")), HR_USER);
  revalidatePath("/hr", "layout");
}

export async function followUpAction(formData: FormData) {
  await createDraftedFollowUp(Number(formData.get("id")));
  revalidatePath("/hr/recommendations");
  redirect("/hr/review");
}

export async function closeNeedAction(formData: FormData) {
  closeNecessitat(Number(formData.get("id")), HR_USER);
  revalidatePath("/hr", "layout");
}

export async function setSignalStatusAction(formData: FormData) {
  const id = Number(formData.get("id"));
  setSignalStatus(id, String(formData.get("status") ?? ""), HR_USER);
  revalidatePath("/hr", "layout");
}

export async function setAlarmStatusAction(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (!["acknowledged", "action_linked", "resolved", "dismissed"].includes(status)) return;
  try {
    const id = Number(formData.get("id"));
    const before = alarmInfo(id);
    changeAlarmStatus(id, status as AlarmStatus);
    if (before && before.status !== status) {
      recordDecision({ entity: "senyal", entityId: id, action: "status", font: "engine_alarm", actor: HR_USER, fromState: before.status, toState: status, subject: before.description });
    }
  } catch {
    // invalid transition (stale page): just refresh
  }
  revalidatePath("/hr", "layout");
}

/** Archive a resolved or dismissed alarm (archive=1) or bring it back to its tab (archive=0). */
export async function archiveAlarmAction(formData: FormData) {
  setAlarmArchived(Number(formData.get("id")), formData.get("archive") === "1", HR_USER);
  revalidatePath("/hr", "layout");
}

/** A resolved alarm came back or a dismissed one turned out to matter: reopen it. */
export async function reopenAlarmAction(formData: FormData) {
  reopenClosedAlarm(Number(formData.get("id")), HR_USER);
  revalidatePath("/hr", "layout");
}

export async function recomputeAction() {
  const { getScheduler } = await import("@/lib/engine");
  await getScheduler().runNow();
  revalidatePath("/hr", "layout");
}

/** Pool control: a person retires a question from the rotation, or brings a previously approved one back. */
export async function setQuestionActiveAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  const before = questionInfo(id);
  hrSetQuestionActive(id, active, HR_USER);
  const after = questionInfo(id);
  if (before && after && before.estat !== after.estat) {
    recordDecision({ entity: "pregunta", entityId: id, necessitatId: after.necessitatId, action: active ? "restore" : "retire", font: after.font, actor: HR_USER, fromState: before.estat, toState: after.estat, subject: after.text });
  }
  revalidatePath("/hr/pool");
}

/** Dashboard "Actualitza": re-reads the database (aggregates, alarms) and rewrites the AI summary when an LLM key is configured. */
export async function refreshDashboardAction(formData: FormData) {
  const { getScheduler } = await import("@/lib/engine");
  const s = getScheduler();
  invalidateHrMemo();
  s.runNow();
  let status = "ok";
  if (!process.env.LLM_API_KEY) status = "sense-llm";
  else {
    const r = await s.runNarrativeNow();
    status = r === null ? "ocupat" : r.segments.some((x) => x.status === "failed") ? "fallada" : "ok";
  }
  invalidateHrMemo();
  revalidatePath("/hr", "layout");
  const q = new URLSearchParams();
  for (const k of ["r", "from", "to", "c"]) {
    const v = formData.get(k);
    if (typeof v === "string" && v) q.set(k, v);
  }
  q.set("actualitzat", status);
  redirect(`/hr?${q.toString()}`);
}
