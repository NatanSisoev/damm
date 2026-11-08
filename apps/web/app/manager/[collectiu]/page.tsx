import Link from "next/link";
import { People } from "../../hr/glyphs";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import {
  getRepresentativeness,
  getTrends,
  listCollectius,
  listDomains,
  listTorns,
  listManagerRecommendations,
  listManagerSignals,
  listThemes,
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { hrAlarms, hrInsights } from "@/lib/hr-engine";
import { InsightCards } from "../../hr/insight-cards";
import { Radar, type RadarSeries } from "../../hr/radar";
import { RepTable, TrendTable } from "../../hr/tables";
import { Card, Empty, PageHeader } from "../../hr/ui";
import { SuppressedBadge } from "../../hr/ui-server";
import { SignalBadges } from "../../hr/signal-labels";
import { compareSignals, signalDetail, signalHeadline } from "@/lib/signal-text";
import { getTL } from "@/lib/i18n/server";
import { managerDict } from "@/lib/i18n/manager";
import { collectiveLabel } from "@/lib/i18n/names";
import { num1L } from "@/lib/i18n/num";
import { AggregateNote } from "../note";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("manager");

export default async function ManagerCollectivePage({ params }: { params: Promise<{ collectiu: string }> }) {
  const { collectiu: raw } = await params;
  const { t, lang } = await getTL(managerDict);
  const nom = decodeURIComponent(raw);
  const all = listCollectius();
  const collectiu = all.find((c) => c.nom === nom);
  if (!collectiu) notFound();

  const trends = getTrends();
  const series = trends.series.find((s) => s.scope === collectiu.nom);
  const rep = getRepresentativeness();
  const repRows = rep.collectius.filter((r) => r.collectiu === collectiu.nom);
  const shiftRows = rep.torns.filter((r) => r.collectiu === collectiu.nom);
  const themes = listThemes({ collectiuId: collectiu.id, lang }).filter((th) => !th.suprimit);
  const signals = listManagerSignals(collectiu.id);
  const recs = listManagerRecommendations(collectiu.id, lang);
  // Viewer comes from the route's collective, never from a request parameter; managers only get their own hr_manager alarms.
  const viewer = { role: "manager" as const, collectiuId: collectiu.id };
  const insights = hrInsights(viewer, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 8);
  const alarms = hrAlarms(viewer);
  const domainName = new Map(listDomains().map((d) => [d.id, d.nom]));
  const tornName = new Map(listTorns().map((tn) => [tn.id, tn.nom]));
  // One list for alarms and signals, same text and order (severity, then size of the drop).
  const cards = [
    ...alarms.map((a) => ({ key: `alarm-${a.id}`, tipus: a.type, descripcio: a.description, severity: a.severity, n: a.n,
      domini: a.domainId ? domainName.get(a.domainId) ?? null : null, torn: a.tornId ? tornName.get(a.tornId) ?? null : null, collectiu: collectiu.nom })),
    ...signals.filter((s) => !alarms.some((a) => a.id === s.id)).map((s) => ({ key: `signal-${s.id}`, tipus: s.tipus, descripcio: s.descripcio,
      severity: s.severity, n: s.n, domini: s.domini, torn: s.torn, collectiu: collectiu.nom })),
  ].sort(compareSignals);

  const last = trends.periodes.length - 1;
  const latest = trends.periodes[last];
  const prev = trends.periodes[last - 1];
  const radarSeries: RadarSeries[] = series
    ? [
        { label: `${collectiveLabel(collectiu.nom, lang)} · ${latest}`, values: series.rows.map((r) => r.cells[last]?.mitjana ?? null), tone: "primary" },
        ...(prev ? [{ label: `${collectiveLabel(collectiu.nom, lang)} · ${prev}`, values: series.rows.map((r) => r.cells[last - 1]?.mitjana ?? null), tone: "compare" as const }] : []),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={collectiveLabel(collectiu.nom, lang)}
        subtitle={t("page_subtitle")}
        actions={
          <>
            {rep.periode && <span className="badge num">{rep.periode}</span>}
            <Link href="/manager" className="btn">{t("switch")}</Link>
          </>
        }
      />
      <AggregateNote />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={t("profile")} meta={t("profile_meta")}>
          {series ? <Radar axes={series.rows.map((r) => r.domini)} series={radarSeries} /> : <Empty>{t("no_visible")}</Empty>}
        </Card>

        <Card title={t("recs")} meta={<span className="num">{recs.length}</span>}>
          {recs.length === 0 ? (
            <Empty>{t("recs_empty")}</Empty>
          ) : (
            <ul className="space-y-3">
              {recs.map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-4">
                  {r.seguiment && <span className="badge badge-accent mb-2">{t("followup_running")}</span>}
                  <p>{r.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card title={t("insights")} meta={<span className="num">{insights.length}</span>}>
          <InsightCards insights={insights} empty={t("insights_empty", { min: MIN_GROUP_SIZE })} />
        </Card>

        <Card title={t("trend")} meta={t("trend_meta")} flush={!!series}>
          {series ? (
            <>
              <p className="border-b border-line px-5 py-3 text-xs text-subtle">
                {t("prec_a")}<span className="font-medium">{t("prec_indicative")}</span>{t("prec_b", { a: PRECISION_MODERADA_MIN_N })}
                <span className="font-medium">{t("prec_moderate")}</span>{t("prec_c", { a: PRECISION_MODERADA_MIN_N, b: PRECISION_SOLIDA_MIN_N - 1 })}
                <span className="font-medium">{t("prec_solid")}</span>{t("prec_d", { c: PRECISION_SOLIDA_MIN_N, delta: num1L(CHANGE_MIN_DELTA, lang), n: CHANGE_MIN_N })}
              </p>
              <TrendTable periodes={trends.periodes} rows={series.rows} />
            </>
          ) : (
            <Empty>{t("no_visible")}</Empty>
          )}
        </Card>

        <Card
          title={t("rep")}
          meta={<>{t("rep_meta")}<Link href="/hr/methodology" className="underline">{t("rep_how")}</Link></>}
          flush={repRows.length > 0}
        >
          {repRows.length === 0 ? (
            <Empty>{t("rep_empty")}</Empty>
          ) : (
            <>
              <RepTable rows={repRows} byShift={false} />
              {shiftRows.length > 0 && (
                <>
                  <div className="border-t border-line px-5 pt-5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{t("by_shift")}</div>
                  <RepTable rows={shiftRows} byShift />
                </>
              )}
            </>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t("themes")} meta={t("themes_meta")}>
            {themes.length === 0 ? (
              <Empty>{t("themes_empty", { min: MIN_GROUP_SIZE })}</Empty>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {themes.map((th) => (
                  <li key={th.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{th.etiqueta}</span>
                      {th.emergent && <span className="badge badge-accent">{t("emergent")}</span>}
                      <span className="num ml-auto text-xs text-subtle">{th.periode}</span>
                    </div>
                    {th.resum && <p className="mt-1 text-[13px] text-muted">{th.resum}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-subtle">{t("themes_foot", { min: MIN_GROUP_SIZE })}</p>
          </Card>

          <Card title={t("signals")} meta={<span className="num">{cards.length}</span>}>
            {signals.length === 0 && alarms.length === 0 ? (
              <Empty>{t("signals_empty")}</Empty>
            ) : (
              <ul className="space-y-3">
                {cards.map((c) => (
                  <li key={c.key} className="rounded-lg border border-line p-3">
                    <p className="text-[14px] font-semibold">{signalHeadline(c, lang)}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{signalDetail(c, lang)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SignalBadges tipus={c.tipus} severity={c.severity} />
                      <span className="num ml-auto text-xs text-subtle"><People n={c.n} scoped={true} /></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <SuppressedNote />
          </Card>
        </div>
      </div>
    </>
  );
}

async function SuppressedNote() {
  const { t } = await getTL(managerDict);
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-subtle">
      <SuppressedBadge /> {t("suppressed_note", { min: MIN_GROUP_SIZE })}
    </p>
  );
}
