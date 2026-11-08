import type { Metadata } from "next";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { LangSwitcher } from "@/components/lang-switcher";
import { Card, PageHeader } from "../ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(hrDict);
  return { title: t("set_meta_title") };
}

export default async function SettingsPage() {
  const t = await getT(hrDict);
  return (
    <>
      <PageHeader title={t("set_title")} subtitle={t("set_subtitle")} />
      <div className="max-w-2xl space-y-4">
        <Card title={t("set_lang_title")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[14px] text-muted">{t("set_lang_body")}</p>
            <LangSwitcher className="border border-line px-3" />
          </div>
        </Card>
        <Card title={t("set_export_title")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-[14px] text-muted">{t("set_export_body", { min: MIN_GROUP_SIZE })}</p>
            <a href="/hr/results/export" className="btn" download>{t("set_export_btn")}</a>
          </div>
        </Card>
      </div>
    </>
  );
}
