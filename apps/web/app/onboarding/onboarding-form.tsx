"use client";

import { useActionState } from "react";
import { registerAction, type OnboardingState } from "./actions";
import { RecoveryCodeScreen } from "./recovery-code";

export function OnboardingForm({ codi, empresa, collectiu }: { codi: string; empresa: string; collectiu: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(registerAction, {});
  if (state.recoveryCode) return <RecoveryCodeScreen code={state.recoveryCode} title="Compte creat" />;
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm opacity-60">
          {empresa} · {collectiu}
        </p>
        <h1 className="text-2xl font-semibold">Crea el teu compte</h1>
      </div>
      <p className="text-sm opacity-70">
        Tria un nom d&apos;usuari i una contrasenya. No et demanem correu, telèfon ni nom: les teves respostes són
        anònimes.
      </p>
      <input type="hidden" name="codi" value={codi} />
      <label className="block space-y-1 text-sm">
        <span>Nom d&apos;usuari</span>
        <input name="username" required autoComplete="username" autoCapitalize="none" className="w-full rounded border bg-transparent px-3 py-3" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contrasenya</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border bg-transparent px-3 py-3" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Repeteix la contrasenya</span>
        <input name="password2" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded border bg-transparent px-3 py-3" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-black px-4 py-3 text-white disabled:opacity-40 dark:bg-white dark:text-black">
        Crea el compte
      </button>
    </form>
  );
}
