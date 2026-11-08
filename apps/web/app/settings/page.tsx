import Link from "next/link";
import { redirect } from "next/navigation";
import { getShiftChoice } from "@damm/db/employee";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { LangSwitcher } from "@/components/lang-switcher";
import { employeeDict } from "@/lib/i18n/employee";
import { getTL } from "@/lib/i18n/server";
import { shiftChoices } from "@/lib/shift-options";
import { vapidPublicKey } from "@/lib/push";
import { getCompteId } from "@/lib/session";
import { PushToggle } from "../(employee)/components/push-toggle";
import { EmployeeShell } from "../(employee)/components/shell";
import { logoutAction } from "./actions";
import { ChangePasswordPanel, DeleteAccountPanel, RecoveryPanel, ShiftPanel } from "./account-panels";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("settings");

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const { t, lang } = await getTL(employeeDict);
  const shift = getShiftChoice(compteId);
  return (
    <EmployeeShell back title={t("settings_title")}>
      <h1 className="page-title">{t("settings_title")}</h1>
      <p className="mt-1 text-subtle">
        {t("settings_lede", { min: MIN_GROUP_SIZE })}
      </p>

      <section className="card mt-6">
        <div className="card-body space-y-2">
          <h2 className="section-title">{t("settings_language")}</h2>
          <p className="text-muted">{t("settings_language_hint")}</p>
          <LangSwitcher />
        </div>
      </section>

      <section className="card mt-4">
        <div className="card-body space-y-2">
          <h2 className="section-title">{t("settings_privacy_title")}</h2>
          <p className="text-muted">{t("settings_privacy_text")}</p>
          <Link href="/privacitat" className="btn h-12 w-full justify-center text-base">
            {t("settings_privacy_btn")}
          </Link>
        </div>
      </section>

      {shift.options.length > 0 && <ShiftPanel options={shiftChoices(shift.options, lang)} current={shift.current ?? ""} />}

      {vapidPublicKey() ? (
        <PushToggle vapidKey={vapidPublicKey()!} />
      ) : (
        <section className="card mt-4">
          <div className="card-body space-y-2">
            <h2 className="section-title">{t("push_title")}</h2>
            <p className="text-muted">{t("settings_push_off")}</p>
          </div>
        </section>
      )}

      <ChangePasswordPanel />
      <RecoveryPanel />

      <section className="card mt-4">
        <div className="card-body space-y-2">
          <h2 className="section-title">{t("settings_session_title")}</h2>
          <p className="text-muted">{t("settings_session_text")}</p>
          <form action={logoutAction}>
            <button className="btn h-12 w-full justify-center text-base">{t("settings_logout")}</button>
          </form>
        </div>
      </section>

      <DeleteAccountPanel />
    </EmployeeShell>
  );
}
