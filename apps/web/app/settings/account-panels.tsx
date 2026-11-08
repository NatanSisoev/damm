"use client";

import { useActionState, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";
import { PasswordField } from "../(employee)/components/password-field";
import { RecoveryCodeScreen } from "../onboarding/recovery-code";
import {
  changePasswordAction,
  deleteAccountAction,
  regenerateRecoveryAction,
  type SettingsState,
} from "./actions";

const err = "font-semibold text-warn";

export function ChangePasswordPanel() {
  const t = useT(employeeDict);
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePasswordAction, {});
  return (
    <section className="card mt-4" aria-labelledby="canvi-pw">
      <form action={action} className="card-body space-y-4">
        <h2 id="canvi-pw" className="section-title">
          {t("pw_title")}
        </h2>
        <PasswordField name="currentPassword" label={t("password_current")} autoComplete="current-password" />
        <PasswordField name="newPassword" label={t("password_new")} autoComplete="new-password" showHint minLength={8} />
        <PasswordField name="newPassword2" label={t("pw_repeat_new")} autoComplete="new-password" minLength={8} />
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
          {t("pw_title")}
        </button>
      </form>
    </section>
  );
}

export function RecoveryPanel() {
  const t = useT(employeeDict);
  const [state, action, pending] = useActionState<SettingsState, FormData>(regenerateRecoveryAction, {});
  if (state.recoveryCode) {
    return (
      <section className="card mt-4">
        <div className="card-body">
          <RecoveryCodeScreen code={state.recoveryCode} title={t("rec_panel_new")} continueHref="/settings" continueLabel={t("rec_panel_done")} />
          <p className="mt-3 text-sm text-muted">{t("rec_panel_old_invalid")}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="card mt-4" aria-labelledby="rec">
      <form action={action} className="card-body space-y-4">
        <h2 id="rec" className="section-title">
          {t("rec_panel_title")}
        </h2>
        <p className="text-muted">
          {t("rec_panel_text")}
        </p>
        <PasswordField name="currentPassword" label={t("password_current")} autoComplete="current-password" />
        {state.error && (
          <p role="alert" className={err}>
            {state.error}
          </p>
        )}
        <button disabled={pending} className="btn h-12 w-full justify-center text-base disabled:opacity-50">
          {t("rec_panel_btn")}
        </button>
      </form>
    </section>
  );
}

export function DeleteAccountPanel() {
  const t = useT(employeeDict);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccountAction, {});
  return (
    <section className="card mt-4 border-2 border-accent" aria-labelledby="del">
      <div className="card-body space-y-3">
        <h2 id="del" className="section-title">
          {t("del_title")}
        </h2>
        <p className="text-muted">
          {t("del_text")}
        </p>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="btn h-12 w-full justify-center text-base">
            {t("del_start")}
          </button>
        ) : (
          <form action={action} className="space-y-4">
            <p className="rounded-xl border-2 border-accent bg-accent-soft px-4 py-3 font-semibold">
              {t("del_confirm")}
            </p>
            <PasswordField name="currentPassword" label={t("password_current")} autoComplete="current-password" />
            {state.error && (
              <p role="alert" className={err}>
                {state.error}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button disabled={pending} className="btn btn-primary h-12 flex-1 justify-center text-base disabled:opacity-50">
                {t("del_yes")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn h-12 flex-1 justify-center text-base">
                {t("del_cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
