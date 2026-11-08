"use server";

import { redirect } from "next/navigation";
import { changePassword, deleteAccount, setCompteShift, deletePushSubscription, regenerateRecoveryCode, savePushSubscription } from "@damm/db/employee";
import { clientIp } from "@/lib/client-ip";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { destroySession, getCompteId } from "@/lib/session";

export type SettingsState = { error?: string; ok?: string; recoveryCode?: string };

const ERRORS = {
  credencials: "err_wrong_password",
  password_curta: "err_new_password_short",
  massa_intents: "err_too_many_wait",
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
  const t = await getT(employeeDict);
  const next = String(formData.get("newPassword") ?? "");
  if (next !== String(formData.get("newPassword2") ?? "")) return { error: t("err_new_password_mismatch") };
  const res = await changePassword({
    compteId,
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: next,
    clientIp: await clientIp(),
  });
  if (!res.ok) return { error: t(ERRORS[res.error]) };
  return { ok: t("pw_done") };
}

export async function regenerateRecoveryAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const t = await getT(employeeDict);
  const res = await regenerateRecoveryCode({ compteId, currentPassword: String(formData.get("currentPassword") ?? ""), clientIp: await clientIp() });
  if (!res.ok) return { error: t(ERRORS[res.error]) };
  return { recoveryCode: res.recoveryCode };
}

export async function deleteAccountAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const t = await getT(employeeDict);
  const res = await deleteAccount({ compteId, currentPassword: String(formData.get("currentPassword") ?? ""), clientIp: await clientIp() });
  if (!res.ok) return { error: t(ERRORS[res.error]) };
  await destroySession();
  redirect("/join?compte=esborrat");
}

/** Stores this device's push subscription for the signed-in account (an account can have several devices). */
export async function savePushSubscriptionAction(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): Promise<{ ok: boolean }> {
  const compteId = await getCompteId();
  if (!compteId) return { ok: false };
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048 || !p256dh || !auth || p256dh.length > 256 || auth.length > 64) return { ok: false };
  savePushSubscription(compteId, { endpoint, p256dh, auth });
  return { ok: true };
}

/** Turns push off on this device only (the endpoint); without one, every device of the account. */
export async function deletePushSubscriptionAction(endpoint?: string): Promise<{ ok: boolean }> {
  const compteId = await getCompteId();
  if (!compteId) return { ok: false };
  deletePushSubscription(compteId, typeof endpoint === "string" && endpoint ? endpoint : undefined);
  return { ok: true };
}

export async function setShiftAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const t = await getT(employeeDict);
  setCompteShift(compteId, String(formData.get("torn") ?? "") || null);
  return { ok: t("settings_shift_saved") };
}
