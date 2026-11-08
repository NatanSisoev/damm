import Link from "next/link";
import type { Metadata } from "next";
import { decisionSummary, listDecisions } from "@damm/db/hr";
import { getT, getTL } from "@/lib/i18n/server";
import { LOCALES, makeT } from "@/lib/i18n/core";
import { trailDict, type TrailKey } from "@/lib/i18n/hr-trail";
import { Card, Empty, PageHeader, Stat } from "../ui";
import { DecisionList } from "../trail";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(trailDict);
  return { title: t("tr_meta_title") };
}

const AI_FONTS = new Set(["ai_draft", "ai_redraft", "ai_followup", "ai_recommendation"]);

export default async function TraceabilityPage() {
  const { t, lang } = await getTL(trailDict);
  const sum = decisionSummary();
  const rows = listDecisions({ limit: 100 });
  const day = (d: string | null) => (d ? new Date(d.replace(" ", "T") + "Z").toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }) : "");
  const aiDecisions = sum.byFont.filter((f) => AI_FONTS.has(f.font)).reduce((a, f) => a + f.n, 0);
  return (
    <>
      <PageHeader title={t("tr_title")} subtitle={t("tr_subtitle")} actions={<Link href="/hr/needs" className="btn">{t("tr_back")}</Link>} />
      {sum.total === 0 ? (
        <Empty>{t("tr_empty")}</Empty>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("tr_sum_total")} value={<span className="num">{sum.total}</span>} hint={t("tr_sum_period", { from: day(sum.first), to: day(sum.last) })} />
            <Stat label={t("tr_sum_ai")} value={<span className="num">{aiDecisions}</span>} hint={t("tr_sum_ai_hint")} />
            <Stat label={t("tr_sum_edits")} value={<span className="num">{sum.edits}</span>} hint={t("tr_sum_edits_hint")} />
          </div>
          <Card title={t("tr_by_source")}>
            <ul className="flex flex-wrap gap-2">
              {sum.byFont.map((f) => (
                <li key={f.font} className="badge">
                  {makeT(trailDict, lang)(`f_${f.font}` as TrailKey)} <span className="num ml-1 font-semibold">{f.n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t("tr_latest")} meta={t("tr_only_hr")}>
            <DecisionList rows={rows} lang={lang} />
          </Card>
        </div>
      )}
    </>
  );
}
