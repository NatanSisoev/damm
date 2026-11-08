"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addContextEvent, approveRecommendation, discardRecommendation } from "@damm/db/hr";
import { ProbeError, hrStartProbe, hrStopProbe } from "@/lib/hr-engine";
import { createDraftedFollowUp } from "../../follow-up";
import { getT } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";

// Same human actions as the recommendations page; they only revalidate the signal page too.
function refresh(formData: FormData) {
  const signalId = Number(formData.get("signal"));
  if (signalId > 0) revalidatePath(`/hr/signals/${signalId}`);
  revalidatePath("/hr/recommendations");
}

export async function approveFromSignalAction(formData: FormData) {
  approveRecommendation(Number(formData.get("id")), String(formData.get("approver") ?? ""));
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

const idOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Indagar: samples this signal's domain more in its segment for a while. Errors come back in the URL (no client state). */
export async function startProbeAction(formData: FormData) {
  const signalId = Number(formData.get("signal"));
  const collectiuId = idOrNull(formData.get("collectiu"));
  const dominiId = idOrNull(formData.get("domini"));
  let error: string | null = null;
  if (!collectiuId || !dominiId) {
    error = (await getT(hrResultsDict))("sd_err_probe");
  } else {
    try {
      const boost = Number(formData.get("boost") ?? 2);
      const days = Math.round(Number(formData.get("days") ?? 14));
      hrStartProbe({ senyalId: signalId, collectiuId, tornId: idOrNull(formData.get("torn")), dominiId, boost, days });
    } catch (e) {
      if (!(e instanceof ProbeError)) throw e;
      error = e.message;
    }
  }
  revalidatePath(`/hr/signals/${signalId}`);
  if (error) redirect(`/hr/signals/${signalId}?probeError=${encodeURIComponent(error)}#indagar`);
  redirect(`/hr/signals/${signalId}#indagar`);
}

export async function stopProbeAction(formData: FormData) {
  const signalId = Number(formData.get("signal"));
  try {
    hrStopProbe(Number(formData.get("id")));
  } catch (e) {
    if (!(e instanceof ProbeError)) throw e;
  }
  revalidatePath(`/hr/signals/${signalId}`);
}

/** Records something that happened (a new shift system...). Anchors a "since" comparison; it is context, not a cause. */
export async function addContextEventAction(formData: FormData) {
  const signalId = Number(formData.get("signal"));
  let error: string | null = null;
  try {
    addContextEvent({
      date: String(formData.get("date") ?? ""),
      label: String(formData.get("label") ?? ""),
      collectiuId: idOrNull(formData.get("collectiu")),
      tornId: idOrNull(formData.get("torn")),
      dominiId: idOrNull(formData.get("domini")),
    });
  } catch {
    error = (await getT(hrResultsDict))("sd_err_event");
  }
  revalidatePath(`/hr/signals/${signalId}`);
  if (error) redirect(`/hr/signals/${signalId}?eventError=${encodeURIComponent(error)}#context`);
}
