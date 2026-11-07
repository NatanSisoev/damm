"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordField } from "../(employee)/components/password-field";
import { TextField } from "../(employee)/components/text-field";
import { registerAction, type OnboardingState } from "./actions";
import { RecoveryCodeScreen } from "./recovery-code";

export function OnboardingForm({ codi }: { codi: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(registerAction, {});
  if (state.recoveryCode) return <RecoveryCodeScreen code={state.recoveryCode} title="Compte creat" />;
  return (
    <form action={action} className="space-y-5">
      <p className="text-muted">
        Tria un nom d&apos;usuari i una contrasenya. No et demanem correu, telèfon ni nom: les teves respostes són
        anònimes.
      </p>
      <input type="hidden" name="codi" value={codi} />
      <TextField name="username" label="Nom d'usuari" autoComplete="username" hint="No facis servir el teu nom real." />
      <PasswordField name="password" label="Contrasenya" autoComplete="new-password" showHint minLength={8} />
      <PasswordField name="password2" label="Repeteix la contrasenya" autoComplete="new-password" minLength={8} />
      {state.error && (
        <p role="alert" className="font-semibold text-warn">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
        Crea el compte
      </button>
      <p className="text-center text-sm">
        Ja tens compte?{" "}
        <Link href="/login" className="font-semibold underline">
          Entra
        </Link>
      </p>
    </form>
  );
}
