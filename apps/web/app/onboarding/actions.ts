"use server";

import { registerAccount } from "@damm/db/employee";
import { createSession } from "@/lib/session";

export type OnboardingState = { error?: string; recoveryCode?: string };

const ERRORS = {
  codi_invalid: "Aquest codi no és vàlid o ja no està actiu.",
  username_invalid: "L'usuari ha de tenir entre 3 i 30 caràcters: lletres minúscules, xifres, punt, guió o guió baix.",
  username_ocupat: "Aquest nom d'usuari ja existeix. Prova'n un altre.",
  password_curta: "La contrasenya ha de tenir almenys 8 caràcters.",
} as const;

export async function registerAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("password2") ?? "")) return { error: "Les contrasenyes no coincideixen." };
  const res = await registerAccount({
    codi: String(formData.get("codi") ?? ""),
    username: String(formData.get("username") ?? ""),
    password,
  });
  if (!res.ok) return { error: ERRORS[res.error] };
  await createSession(res.compteId);
  return { recoveryCode: res.recoveryCode };
}
