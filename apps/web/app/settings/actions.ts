"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { changePassword, deleteAccount, deletePushSubscription, regenerateRecoveryCode } from "@damm/db/employee";
import { destroySession, getCompteId } from "@/lib/session";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export type SettingsState = { error?: string; ok?: string; recoveryCode?: string };

const ERRORS = {
  credencials: "La contrasenya actual no és correcta.",
  password_curta: "La contrasenya nova ha de tenir almenys 8 caràcters.",
  massa_intents: "Massa intents. Espera uns minuts i torna-ho a provar.",
} as const;

export async function logoutAction() {
  const compteId = await getCompteId();
  if (compteId) deletePushSubscription(compteId);
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const next = String(formData.get("newPassword") ?? "");
  if (next !== String(formData.get("newPassword2") ?? "")) return { error: "Les contrasenyes noves no coincideixen." };
  const res = await changePassword({
    compteId,
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: next,
    clientIp: await clientIp(),
  });
  if (!res.ok) return { error: ERRORS[res.error] };
  return { ok: "Contrasenya canviada." };
}

export async function regenerateRecoveryAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const res = await regenerateRecoveryCode({ compteId, currentPassword: String(formData.get("currentPassword") ?? ""), clientIp: await clientIp() });
  if (!res.ok) return { error: ERRORS[res.error] };
  return { recoveryCode: res.recoveryCode };
}

export async function deleteAccountAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const res = await deleteAccount({ compteId, currentPassword: String(formData.get("currentPassword") ?? ""), clientIp: await clientIp() });
  if (!res.ok) return { error: ERRORS[res.error] };
  await destroySession();
  redirect("/join?compte=esborrat");
}
