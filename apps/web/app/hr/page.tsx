import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getHrOverview } from "@damm/db/hr";
import { Card, Empty, FoldList, PageHeader, Stat } from "./ui";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { LOCALES } from "@/lib/i18n/core";
import { getHeadlines, getNarrative, getProposals, getReachGaps } from "./analytics";
import { HeadlineStrip, NarrativeCard, ProposalsCard, ReachCard } from "./analytics-ui";

export default async function HrHome() {
  const { t, lang } = await getTL(hrDict);
  const loc = LOCALES[lang];
  const o = getHrOverview();
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString(loc));
  const drafts = o.pending.filter((i) => i.kind === "draft");

  return (
    <>
      <PageHeader
        title={t("home_title")}
        subtitle={t("home_subtitle")}
        actions={o.periode ? <span className="badge num">{o.periode}</span> : undefined}
      />

      <div className="space-y-6">
        <HeadlineStrip headlines={getHeadlines()} />
        <NarrativeCard narrative={getNarrative("All")} title={t("home_summary")} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={t("home_participation")}
            value={o.participation === null ? "—" : `${Math.round(o.participation * 100)}%`}
            hint={
              o.coveredPopulation === null
                ? t("home_of_people", { n: o.population.toLocaleString(loc) })
                : `${t("home_of_people", { n: o.coveredPopulation.toLocaleString(loc) })}${o.excludedCollectius > 0 ? ` ${t(o.excludedCollectius === 1 ? "home_hidden_one" : "home_hidden_many", { n: o.excludedCollectius, min: MIN_GROUP_SIZE })}` : ""}`
            }
          />
          <Stat label={t("home_responded")} value={fmt(o.respondents)} hint={o.periode ?? t("home_no_period")} />
          <Stat label={t("home_open_needs")} value={o.openNeeds} hint={t("home_unpublished")} />
          <Stat label={t("home_signals")} value={o.signalCount} hint={`n ≥ ${MIN_GROUP_SIZE}`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ProposalsCard proposals={getProposals()} />
          <Card
            title={t("home_drafts_title")}
            meta={<Link href="/hr/needs?estat=esborrany" className="text-accent-ink hover:underline">{t("open_arrow")}</Link>}
          >
            {drafts.length === 0 ? (
              <Empty>{t("home_no_drafts")}</Empty>
            ) : (
              <FoldList visible={3} className="-my-1 divide-y divide-line" items={drafts.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <Link href="/hr/needs?estat=esborrany" className="flex items-start gap-3 py-3 hover:text-accent-ink">
                      <span className="badge mt-0.5">{t("status_draft")}</span>
                      <span className="text-[13px]">{i.text}</span>
                    </Link>
                  </li>
                ))} />
            )}
          </Card>
        </div>

        <ReachCard gaps={getReachGaps(3)} />

        <p className="text-sm">
          <Link href="/hr/results" className="text-accent-ink hover:underline">
            {t("home_more_link")}
          </Link>
        </p>
      </div>
    </>
  );
}
