"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { advanceSignalStatus } from "@damm/db/hr";
import { ProbeError, hrStartProbe, hrStopProbe } from "@/lib/hr-engine";
import { getT } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";

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
      advanceSignalStatus(signalId, "action_linked");
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
