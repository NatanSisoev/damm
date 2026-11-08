"use server";

import { redirect } from "next/navigation";
import { normalizeJoinCode } from "@/lib/join-code";

/** Typed code → /join/<code>. Tolerates spaces, case and missing hyphen ("damm fab"). */
export async function goToJoinAction(formData: FormData) {
  const codi = normalizeJoinCode(String(formData.get("codi") ?? "")).replace(/[\s_]+/g, "-");
  redirect(codi ? `/join/${encodeURIComponent(codi)}` : "/join");
}
