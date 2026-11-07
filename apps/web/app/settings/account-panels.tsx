"use client";

import { useActionState, useState } from "react";
import { PasswordField } from "../(employee)/components/password-field";
import { RecoveryCodeScreen } from "../onboarding/recovery-code";
import {
  changePasswordAction,
  deleteAccountAction,
  regenerateRecoveryAction,
  type SettingsState,
} from "./actions";

const err = "font-semibold text-accent-ink";

export function ChangePasswordPanel() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePasswordAction, {});
  return (
    <section className="card mt-4" aria-labelledby="canvi-pw">
      <form action={action} className="card-body space-y-4">
        <h2 id="canvi-pw" className="section-title">
          Canvia la contrasenya
        </h2>
        <PasswordField name="currentPassword" label="Contrasenya actual" autoComplete="current-password" />
        <PasswordField name="newPassword" label="Contrasenya nova" autoComplete="new-password" showHint minLength={8} />
        <PasswordField name="newPassword2" label="Repeteix la contrasenya nova" autoComplete="new-password" minLength={8} />
        {state.error && (
          <p role="alert" className={err}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="font-semibold text-good">
            {state.ok}
          </p>
        )}
        <button disabled={pending} className="btn btn-primary h-12 w-full justify-center text-base disabled:opacity-50">
          Canvia la contrasenya
        </button>
      </form>
    </section>
  );
}

export function RecoveryPanel() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(regenerateRecoveryAction, {});
  if (state.recoveryCode) {
    return (
      <section className="card mt-4">
        <div className="card-body">
          <RecoveryCodeScreen code={state.recoveryCode} title="Codi de recuperació nou" continueHref="/settings" continueLabel="Fet" />
          <p className="mt-3 text-sm text-muted">El codi anterior ja no funciona.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="card mt-4" aria-labelledby="rec">
      <form action={action} className="card-body space-y-4">
        <h2 id="rec" className="section-title">
          Codi de recuperació
        </h2>
        <p className="text-muted">
          Si has perdut el codi que et vam donar, en pots generar un de nou. El vell deixarà de servir i el nou només el
          veuràs una vegada.
        </p>
        <PasswordField name="currentPassword" label="Contrasenya actual" autoComplete="current-password" />
        {state.error && (
          <p role="alert" className={err}>
            {state.error}
          </p>
        )}
        <button disabled={pending} className="btn h-12 w-full justify-center text-base disabled:opacity-50">
          Genera un codi nou
        </button>
      </form>
    </section>
  );
}

export function DeleteAccountPanel() {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccountAction, {});
  return (
    <section className="card mt-4 border-2 border-accent" aria-labelledby="del">
      <div className="card-body space-y-3">
        <h2 id="del" className="section-title">
          Esborra el compte
        </h2>
        <p className="text-muted">
          S&apos;esborren el teu usuari, la contrasenya i la subscripció a les notificacions. Les respostes que ja has
          donat es conserven com a dades anònimes dins dels resultats de grup: no hi ha manera de tornar-les a vincular amb tu.
          No es pot desfer.
        </p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="btn h-12 w-full justify-center text-base">
            Vull esborrar el compte
          </button>
        ) : (
          <form action={action} className="space-y-4">
            <p className="rounded-xl border-2 border-accent bg-accent-soft px-4 py-3 font-semibold">
              Segur que vols esborrar-lo? Escriu la contrasenya per confirmar.
            </p>
            <PasswordField name="currentPassword" label="Contrasenya actual" autoComplete="current-password" />
            {state.error && (
              <p role="alert" className={err}>
                {state.error}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button disabled={pending} className="btn btn-primary h-12 flex-1 justify-center text-base disabled:opacity-50">
                Sí, esborra el compte
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn h-12 flex-1 justify-center text-base">
                Cancel·la
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
