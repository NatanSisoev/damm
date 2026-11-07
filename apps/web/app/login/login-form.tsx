"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { RecoveryCodeScreen } from "../onboarding/recovery-code";
import { loginAction, recoverAction, type LoginState } from "./actions";

const input = "w-full rounded border bg-transparent px-3 py-3";
const primary = "w-full rounded bg-black px-4 py-3 text-white disabled:opacity-40 dark:bg-white dark:text-black";

export function LoginForm() {
  const [recovering, setRecovering] = useState(false);
  const [login, loginDo, loginPending] = useActionState<LoginState, FormData>(loginAction, {});
  const [rec, recDo, recPending] = useActionState<LoginState, FormData>(recoverAction, {});

  if (rec.recoveryCode) return <RecoveryCodeScreen code={rec.recoveryCode} title="Contrasenya canviada" />;

  if (recovering) {
    return (
      <form action={recDo} className="space-y-5">
        <h1 className="text-2xl font-semibold">Recupera el compte</h1>
        <p className="text-sm opacity-70">
          Introdueix el teu usuari, el codi de recuperació que vas desar i una contrasenya nova. El codi només serveix
          una vegada; te&apos;n donarem un de nou.
        </p>
        <label className="block space-y-1 text-sm">
          <span>Nom d&apos;usuari</span>
          <input name="username" required autoComplete="username" autoCapitalize="none" className={input} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Codi de recuperació</span>
          <input name="code" required autoCapitalize="characters" autoComplete="off" className={`${input} font-mono`} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Contrasenya nova</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </label>
        {rec.error && <p role="alert" className="text-sm text-red-600">{rec.error}</p>}
        <button disabled={recPending} className={primary}>Canvia la contrasenya</button>
        <button type="button" onClick={() => setRecovering(false)} className="w-full text-sm underline">Torna a l&apos;inici de sessió</button>
      </form>
    );
  }

  return (
    <form action={loginDo} className="space-y-5">
      <h1 className="text-2xl font-semibold">Inicia la sessió</h1>
      <label className="block space-y-1 text-sm">
        <span>Nom d&apos;usuari</span>
        <input name="username" required autoComplete="username" autoCapitalize="none" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contrasenya</span>
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      {login.error && <p role="alert" className="text-sm text-red-600">{login.error}</p>}
      <button disabled={loginPending} className={primary}>Entra</button>
      <button type="button" onClick={() => setRecovering(true)} className="w-full text-sm underline">He perdut la contrasenya</button>
      <p className="text-center text-sm opacity-70">
        Primera vegada? Obre l&apos;enllaç d&apos;invitació del teu equip.
      </p>
      <p className="text-center text-sm">
        <Link href="/privacitat" className="underline">Com tractem les teves dades</Link>
      </p>
    </form>
  );
}
