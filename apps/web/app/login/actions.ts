"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCompteLang, recoverAccount, verifyLogin } from "@damm/db/employee";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { setLangCookie } from "@/lib/lang";
import { createSession } from "@/lib/session";

export type LoginState = { error?: string; recoveryCode?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getT(employeeDict);
  const res = await verifyLogin(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""), await clientIp());
  if (!res.ok) {
    return { error: res.error === "massa_intents" ? t("err_too_many_login") : t("err_login") };
  }
  await createSession(res.compteId);
  // Only after a successful login: adopt the language stored on the account.
  await setLangCookie(getCompteLang(res.compteId));
  redirect("/");
}

export async function recoverAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const t = await getT(employeeDict);
  const res = await recoverAccount({
    username: String(formData.get("username") ?? ""),
    recoveryCode: String(formData.get("code") ?? ""),
    newPassword: String(formData.get("password") ?? ""),
    clientIp: await clientIp(),
  });
  if (!res.ok) {
    if (res.error === "massa_intents") return { error: t("err_too_many_login") };
    if (res.error === "password_curta") return { error: t("err_password_short") };
    return { error: t("err_recover") };
  }
  await createSession(res.compteId);
  await setLangCookie(getCompteLang(res.compteId));
  return { recoveryCode: res.recoveryCode };
}
