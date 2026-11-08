"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";
import { ShiftPicker, type ShiftChoice } from "../(employee)/components/shift-picker";
import { PasswordField } from "../(employee)/components/password-field";
import { TextField } from "../(employee)/components/text-field";
import { registerAction, type OnboardingState } from "./actions";
import { RecoveryCodeScreen } from "./recovery-code";

export function OnboardingForm({ codi, shifts = [] }: { codi: string; shifts?: ShiftChoice[] }) {
  const t = useT(employeeDict);
  const [state, action, pending] = useActionState<OnboardingState, FormData>(registerAction, {});
  if (state.recoveryCode) return <RecoveryCodeScreen code={state.recoveryCode} title={t("onb_created")} />;
  return (
    <form action={action} className="space-y-5">
      <p className="text-muted">
        {t("onb_intro")}
      </p>
      <input type="hidden" name="codi" value={codi} />
      <TextField name="username" label={t("username_label")} autoComplete="username" hint={t("onb_username_hint")} />
      <PasswordField name="password" label={t("password_label")} autoComplete="new-password" showHint minLength={8} />
      <PasswordField name="password2" label={t("onb_password_repeat")} autoComplete="new-password" minLength={8} />
      {shifts.length > 0 && <ShiftPicker options={shifts} />}
      {state.error && (
        <p role="alert" className="font-semibold text-warn">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-50">
        {pending ? t("sending") : t("onb_submit")}
      </button>
      <p className="text-center text-sm">
        {t("onb_have_account")}{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold underline">
          {t("enter")}
        </Link>
      </p>
    </form>
  );
}
