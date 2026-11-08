import { LangSwitcher } from "@/components/lang-switcher";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { EmployeeFrame, CompanyLabel, PageHead, PrivacyNote } from "../(employee)/components/frame";
import { goToJoinAction } from "./actions";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("join");

export default async function JoinEntryPage({ searchParams }: { searchParams: Promise<{ compte?: string }> }) {
  const t = await getT(employeeDict);
  const { compte } = await searchParams;
  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <div className="flex justify-end px-4 pt-3">
          <LangSwitcher />
        </div>
        <PageHead title={t("join_title")} lede={t("join_lede")} />
        {compte === "esborrat" && (
          <p role="status" className="mx-4 border border-line bg-surface px-4 py-3 font-semibold">
            {t("join_deleted")}
          </p>
        )}
        <form action={goToJoinAction} className="space-y-4 px-4">
          <div>
            <label htmlFor="codi" className="label">
              {t("join_code_label")}
            </label>
            <input
              id="codi"
              name="codi"
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="DAMM-XXX"
              aria-describedby="codi-hint"
              className="input font-mono uppercase tracking-wider"
            />
            <p id="codi-hint" className="mt-1 text-sm text-muted">
              {t("join_code_hint")}
            </p>
          </div>
          <button className="btn btn-primary h-14 w-full text-base">{t("enter")}</button>
        </form>
        <div className="px-4 pb-8">
          <PrivacyNote>
            {t("privacy_note", { min: MIN_GROUP_SIZE })}
          </PrivacyNote>
        </div>
        <CompanyLabel />
      </main>
    </EmployeeFrame>
  );
}
