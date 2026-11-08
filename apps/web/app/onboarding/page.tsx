import Link from "next/link";
import { listShiftsForJoinCode, lookupJoinCode } from "@damm/db/join";
import { normalizeJoinCode } from "@/lib/join-code";
import { LangSwitcher } from "@/components/lang-switcher";
import { employeeDict } from "@/lib/i18n/employee";
import { getTL } from "@/lib/i18n/server";
import { shiftChoices } from "@/lib/shift-options";
import { EmployeeFrame, PageHead } from "../(employee)/components/frame";
import { OnboardingForm } from "./onboarding-form";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("onboarding");

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ codi?: string }> }) {
  const { t, lang } = await getTL(employeeDict);
  const { codi: raw } = await searchParams;
  const typed = normalizeJoinCode(raw);
  const info = typed ? lookupJoinCode(typed) : null;
  const valid = info !== null && info.actiu;

  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <div className="flex justify-end px-4 pt-3">
          <LangSwitcher />
        </div>
        {valid ? (
          <>
            <PageHead eyebrow={`${info.empresa} · ${info.collectiu}`} title={t("onb_title")} />
            <div className="px-4 pb-8">
              <OnboardingForm codi={info.codi} shifts={shiftChoices(listShiftsForJoinCode(info.codi), lang)} demoSkip={process.env.DEMO_QUICK_JOIN === "1"} />
              <p className="mt-6 text-center text-sm">
                <Link href="/privacitat" className="underline">
                  {t("privacy_link")}
                </Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <PageHead title={t("invalid_code_title")} lede={t("invalid_code_lede")} />
            <p className="px-4">
              <Link href="/join" className="btn">
                {t("onb_other_code")}
              </Link>
            </p>
          </>
        )}
      </main>
    </EmployeeFrame>
  );
}
