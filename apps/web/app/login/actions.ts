"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recoverAccount, verifyLogin } from "@damm/db/employee";
import { createSession } from "@/lib/session";

export type LoginState = { error?: string; recoveryCode?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const TOO_MANY = "Has fet massa intents. Torna-ho a provar d'aquí a una estona.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const res = await verifyLogin(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""), await clientIp());
  if (!res.ok) {
    return { error: res.error === "massa_intents" ? TOO_MANY : "Usuari o contrasenya incorrectes." };
  }
  await createSession(res.compteId);
  redirect("/");
}

export async function recoverAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const res = await recoverAccount({
    username: String(formData.get("username") ?? ""),
    recoveryCode: String(formData.get("code") ?? ""),
    newPassword: String(formData.get("password") ?? ""),
    clientIp: await clientIp(),
  });
  if (!res.ok) {
    if (res.error === "massa_intents") return { error: TOO_MANY };
    if (res.error === "password_curta") return { error: "La contrasenya ha de tenir almenys 8 caràcters." };
    return { error: "Usuari o codi de recuperació incorrectes." };
  }
  await createSession(res.compteId);
  return { recoveryCode: res.recoveryCode };
}
