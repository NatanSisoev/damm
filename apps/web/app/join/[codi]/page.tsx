import Link from "next/link";
import { lookupJoinCode } from "@damm/db/join";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { LangSwitcher } from "@/components/lang-switcher";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { EmployeeFrame, PageHead, PrivacyNote } from "../../(employee)/components/frame";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ codi: string }> }) {
  const t = await getT(employeeDict);
  const { codi } = await params;
  const info = lookupJoinCode(codi.toUpperCase());
  const valid = info !== null && info.actiu;

  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <div className="flex justify-end px-4 pt-3">
          <LangSwitcher />
        </div>
        {valid ? (
          <>
            <PageHead eyebrow={info.empresa} title={t("join_welcome_title")} lede={t("join_welcome_lede", { company: info.empresa })} />
            <div className="space-y-4 px-4">
              <div className="card p-4">
                <div className="text-sm text-muted">{t("join_collective")}</div>
                <div className="text-lg font-bold">{info.collectiu}</div>
              </div>
              <Link
                href={`/onboarding?codi=${encodeURIComponent(codi.toUpperCase())}`}
                className="btn btn-primary h-14 w-full justify-center text-base"
              >
                {t("continue")}
              </Link>
              <PrivacyNote>
                {t("privacy_note", { min: MIN_GROUP_SIZE })}
              </PrivacyNote>
              <p className="pb-8 text-center text-sm">
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
                {t("join_retry")}
              </Link>
            </p>
          </>
        )}
      </main>
    </EmployeeFrame>
  );
}
