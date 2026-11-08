import Link from "next/link";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { rich } from "@/lib/i18n/rich";
import { People } from "../glyphs";
import { listRecommendations, listSignals } from "@damm/db/hr";
import {
  approveRecommendationAction, discardRecommendationAction, followUpAction,
} from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { FoldList } from "../ui-server";
import { SignalBadges, SignalText } from "../signal-labels";
import { compareSignals } from "@/lib/signal-text";
import { recommendationStatus } from "../labels";
import { RecommendationBody } from "../recommendation-card";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_recs");


export default async function RecommendationsPage() {
  const { t, lang } = await getTL(hrDict);
  const signals = listSignals().sort(compareSignals);
  const recs = listRecommendations();
  return (
    <>
      <PageHeader
        title={t("recs_title")}
        subtitle={t("recs_subtitle")}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={t("recs_alarms")} meta={<span className="num">{signals.length}</span>}>
          {signals.length === 0 ? (
            <Empty>{rich(t("recs_no_alarms", { link: "{link}" }), { link: <Link href="/hr/results" className="underline">{t("recs_see_results")}</Link> })}</Empty>
          ) : (
            <FoldList className="space-y-3" items={signals.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-3">
                  <SignalText s={s} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SignalBadges tipus={s.tipus} severity={s.severity} status={s.status} />
                    <span className="num ml-auto text-xs text-subtle">{s.periode} · <People n={s.n} scoped={s.collectiu !== null || s.torn !== null} /></span>
                  </div>
                  <Link href={`/hr/signals/${s.id}`} className="mt-2 inline-block text-xs text-accent-ink hover:underline">{t("recs_see_detail")}</Link>
                </li>
              ))} />
          )}
        </Card>
        <Card title={t("recs_title")} meta={<span className="num">{recs.length}</span>}>
          {recs.length === 0 ? (
            <Empty>{rich(t("recs_no_recs", { link: "{link}" }), { link: <Link href="/hr/needs" className="underline">{t("recs_create_need")}</Link> })}</Empty>
          ) : (
            <FoldList className="space-y-3" items={recs.map((r) => (
                <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`badge ${recommendationStatus(r.estat, lang).cls}`}>{recommendationStatus(r.estat, lang).label}</span>
                    {r.seguimentNecessitatId && <span className="badge badge-accent">{t("recs_followup_created")}</span>}
                  </div>
                  <RecommendationBody r={r} />
                  <Link href={`/hr/recommendations/${r.id}`} className="mt-3 inline-block text-xs text-accent-ink hover:underline">Veure tot el detall →</Link>
                  {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                      {r.estat === "proposada" && (
                        <>
                          <form action={discardRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className="btn">{t("recs_discard")}</button></form>
                          <form action={approveRecommendationAction} className="flex gap-2"><input type="hidden" name="id" value={r.id} /><input name="approver" maxLength={60} autoComplete="off" aria-label={t("approver_label")} placeholder={t("approver_label")} className="input w-40 text-[13px]" /><button className="btn btn-primary">{t("recs_approve")}</button></form>
                        </>
                      )}
                      {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                        <form action={followUpAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">{t("recs_create_followup")}</button></form>
                      )}
                    </div>
                  )}
                </li>
              ))} />
          )}
        </Card>
      </div>
    </>
  );
}
