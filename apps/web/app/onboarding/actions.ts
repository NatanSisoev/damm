"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { registerAccount } from "@damm/db/employee";
import { employeeDict } from "@/lib/i18n/employee";
import { getTL } from "@/lib/i18n/server";
import { createSession } from "@/lib/session";
import { normalizeJoinCode } from "@/lib/join-code";

export type OnboardingState = { error?: string; recoveryCode?: string };

const ERRORS = {
  codi_invalid: "err_code_invalid",
  username_invalid: "err_username_invalid",
  username_ocupat: "err_username_taken",
  password_curta: "err_password_short",
} as const;

export async function registerAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { t, lang } = await getTL(employeeDict);
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("password2") ?? "")) return { error: t("err_password_mismatch") };
  const res = await registerAccount({
    codi: normalizeJoinCode(String(formData.get("codi") ?? "")),
    username: String(formData.get("username") ?? ""),
    password,
    lang,
    torn: String(formData.get("torn") ?? "") || undefined,
  });
  if (!res.ok) return { error: t(ERRORS[res.error]) };
  await createSession(res.compteId);
  return { recoveryCode: res.recoveryCode };
}

/** Demo only (DEMO_QUICK_JOIN=1): creates a throwaway account with a random username and password, signs in and goes straight to the app. */
export async function quickJoinAction(formData: FormData): Promise<void> {
  if (process.env.DEMO_QUICK_JOIN !== "1") return;
  const { lang } = await getTL(employeeDict);
  const codi = normalizeJoinCode(String(formData.get("codi") ?? ""));
  const res = await registerAccount({
    codi,
    username: `demo-${randomBytes(4).toString("hex")}`,
    password: randomBytes(18).toString("base64url"),
    lang,
    torn: String(formData.get("torn") ?? "") || undefined,
  });
  if (!res.ok) redirect(`/onboarding?codi=${encodeURIComponent(codi)}`);
  await createSession(res.compteId);
  redirect("/");
}
