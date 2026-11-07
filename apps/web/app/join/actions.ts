"use server";

import { redirect } from "next/navigation";

/** Typed code → /join/<code>. Tolerates spaces, case and missing hyphen ("damm fab"). */
export async function goToJoinAction(formData: FormData) {
  const raw = String(formData.get("codi") ?? "").trim().toUpperCase().replace(/[\s_]+/g, "-");
  const codi = raw.replace(/[^A-Z0-9-]/g, "");
  redirect(codi ? `/join/${encodeURIComponent(codi)}` : "/join");
}
