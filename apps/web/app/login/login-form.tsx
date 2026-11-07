"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PasswordField } from "../(employee)/components/password-field";
import { TextField } from "../(employee)/components/text-field";
import { RecoveryCodeScreen } from "../onboarding/recovery-code";
import { loginAction, recoverAction, type LoginState } from "./actions";

const err = "font-semibold text-warn";

export function LoginForm() {
  const [recovering, setRecovering] = useState(false);
  const [login, loginDo, loginPending] = useActionState<LoginState, FormData>(loginAction, {});
  const [rec, recDo, recPending] = useActionState<LoginState, FormData>(recoverAction, {});

  if (rec.recoveryCode) return <RecoveryCodeScreen code={rec.recoveryCode} title="Contrasenya canviada" />;

  if (recovering) {
    return (
      <form action={recDo} className="space-y-5">
        <h2 className="section-title">Recupera el compte</h2>
        <p className="text-muted">
          Escriu el teu usuari, el codi de recuperació que vas desar i una contrasenya nova. El codi només serveix
          una vegada; te&apos;n donarem un de nou.
        </p>
        <TextField name="username" label="Nom d'usuari" autoComplete="username" />
        <TextField name="code" label="Codi de recuperació" autoCapitalize="characters" mono />
        <PasswordField name="password" label="Contrasenya nova" autoComplete="new-password" showHint minLength={8} />
        {rec.error && (
          <p role="alert" className={err}>
            {rec.error}
          </p>
        )}
        <button disabled={recPending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
          Canvia la contrasenya
        </button>
        <button type="button" onClick={() => setRecovering(false)} className="btn btn-ghost w-full justify-center underline">
          Torna a entrar
        </button>
      </form>
    );
  }

  return (
    <form action={loginDo} className="space-y-5">
      <TextField name="username" label="Nom d'usuari" autoComplete="username" />
      <PasswordField name="password" label="Contrasenya" autoComplete="current-password" />
      {login.error && (
        <p role="alert" className={err}>
          {login.error}
        </p>
      )}
      <button disabled={loginPending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
        Entra
      </button>
      <button type="button" onClick={() => setRecovering(true)} className="btn btn-ghost w-full justify-center underline">
        He perdut la contrasenya
      </button>
      <p className="text-center text-sm text-muted">Primera vegada? Obre l&apos;enllaç d&apos;invitació del teu equip.</p>
      <p className="text-center text-sm">
        <Link href="/privacitat" className="underline">
          Com tractem les teves dades
        </Link>
      </p>
    </form>
  );
}
