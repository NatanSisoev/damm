"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";
import { PasswordField } from "../(employee)/components/password-field";
import { TextField } from "../(employee)/components/text-field";
import { RecoveryCodeScreen } from "../onboarding/recovery-code";
import { loginAction, recoverAction, type LoginState } from "./actions";

const err = "font-semibold text-warn";

export function LoginForm() {
  const t = useT(employeeDict);
  const [recovering, setRecovering] = useState(false);
  const [login, loginDo, loginPending] = useActionState<LoginState, FormData>(loginAction, {});
  const [rec, recDo, recPending] = useActionState<LoginState, FormData>(recoverAction, {});

  if (rec.recoveryCode) return <RecoveryCodeScreen code={rec.recoveryCode} title={t("login_pw_changed")} />;

  if (recovering) {
    return (
      <form action={recDo} className="space-y-5">
        <h2 className="section-title">{t("login_recover_title")}</h2>
        <p className="text-muted">
          {t("login_recover_intro")}
        </p>
        <TextField name="username" label={t("username_label")} autoComplete="username" />
        <TextField name="code" label={t("login_recover_code")} autoCapitalize="characters" mono />
        <PasswordField name="password" label={t("password_new")} autoComplete="new-password" showHint minLength={8} />
        {rec.error && (
          <p role="alert" className={err}>
            {rec.error}
          </p>
        )}
        <button disabled={recPending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
          {t("login_recover_submit")}
        </button>
        <button type="button" onClick={() => setRecovering(false)} className="btn btn-ghost w-full justify-center underline">
          {t("login_back")}
        </button>
      </form>
    );
  }

  return (
    <form action={loginDo} className="space-y-5">
      <TextField name="username" label={t("username_label")} autoComplete="username" />
      <PasswordField name="password" label={t("password_label")} autoComplete="current-password" />
      {login.error && (
        <p role="alert" className={err}>
          {login.error}
        </p>
      )}
      <button disabled={loginPending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
        {t("enter")}
      </button>
      <button type="button" onClick={() => setRecovering(true)} className="btn btn-ghost w-full justify-center underline">
        {t("login_lost")}
      </button>
      <p className="text-center text-sm text-muted">{t("login_first_time")}</p>
      <p className="text-center text-sm">
        <Link href="/privacitat" className="underline">
          {t("privacy_link")}
        </Link>
      </p>
    </form>
  );
}
