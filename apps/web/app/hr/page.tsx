import Link from "next/link";
import { cookies } from "next/headers";
import { VIEW_ROLE_COOKIE, parseRole } from "@/lib/view-role";
import { MIN_GROUP_SIZE } from "@damm/shared";
import {
  getDataBounds,
  getRepresentativeness,
  getWindowTrends,
  listCollectius,
  getParticipation,
  getAnswersPerDay,
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { hrAlarms, hrInsights } from "@/lib/hr-engine";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { hrDashboardDict } from "@/lib/i18n/hr-dashboard";
import { collectiveLabel, domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { Card, Empty, PageHeader, Stat } from "./ui";
import { TrendChart } from "./trend-chart";
import { Radar, type RadarSeries } from "./radar";
import { RepTable, TrendTable } from "./tables";
import { InsightCards } from "./insight-cards";
import { getHeadlines, getHeatmap, getNarrative, getProposals, getReachGaps, getSegmentTrend } from "./analytics";
import { HeadlineStrip, HeatmapCard, NarrativeCard, ProposalsCard, ReachCard, SegmentTrendCard } from "./analytics-ui";
import { PRESETS, bucketFor, fmtDay, previousWindow, resolveRange } from "./range";
import { refreshDashboardAction } from "./actions";
import { RefreshButton } from "./refresh-button";
import { RangeSelect } from "./range-select";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_home");

export const dynamic = "force-dynamic";


type Params = { r?: string; from?: string; to?: string; c?: string; dom?: string; hide?: string; actualitzat?: string };

const NOTICE_KEY = { ok: "notice_ok", "sense-llm": "notice_no_llm", ocupat: "notice_busy", fallada: "notice_failed" } as const;

export default async function HrDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  const role = parseRole((await cookies()).get(VIEW_ROLE_COOKIE)?.value);
  const { t: tr, lang } = await getTL(hrResultsDict);
  const { t } = await getTL(hrDashboardDict);
  const collectius = listCollectius();
  // Company-wide: only the interval filters the dashboard. `c` is just the heatmap drill-down selection.
  const col = null as (typeof collectius)[number] | null;
  const seg = collectius.find((c) => c.nom === q.c) ?? null;

  const bounds = getDataBounds();
  const range = resolveRange(q, bounds, new Date().toISOString().slice(0, 10));
  const bucket = bucketFor(range.from, range.to);
  const win = { from: range.from, to: range.to };
  const prevWin = range.key === "all" ? null : previousWindow(range.from, range.to, bounds.min);

  const whole = getWindowTrends({ ...win, bucket: "all" }, col?.id ?? null);
  // Thin data: weekly or daily points are often all under the minimum group size, so coarsen until something is visible.
  const visible = (t: ReturnType<typeof getWindowTrends>) => !!t.series[0]?.rows.some((r) => r.cells.some((c) => c.mitjana !== null));
  const order = ["day", "week", "month"] as const;
  let chartBucket: (typeof order)[number] = bucket === "all" ? "month" : bucket;
  let series = getWindowTrends({ ...win, bucket: chartBucket }, col?.id ?? null);
  while (!visible(series) && chartBucket !== "month") {
    chartBucket = order[order.indexOf(chartBucket) + 1];
    series = getWindowTrends({ ...win, bucket: chartBucket }, col?.id ?? null);
  }
  const coarsened = chartBucket !== bucket;
  const seriesVisible = visible(series);
  const everyone = col ? getWindowTrends({ ...win, bucket: "all" }, null) : whole;

  const rep = getRepresentativeness();
  const heatmap = { ...getHeatmap(everyone), periode: `${fmtDay(range.from)} – ${fmtDay(range.to)}` };

  const overall = whole.series[0];
  const axes = overall ? overall.rows.map((r) => r.domini) : [];
  const vals = (sc: typeof overall) => (sc ? sc.rows.map((r) => r.cells[0]?.mitjana ?? null) : []);
  // Radar: the company and every collective, each with its own colour token. Any can be hidden; at least one stays.
  const COMPANY = "Tots";
  const entities = [{ key: COMPANY, id: null as number | null, color: "var(--co-1)", label: tr("rs_all") }, ...collectius.map((c, i) => ({ key: c.nom, id: c.id as number | null, color: `var(--co-${i + 2})`, label: collectiveLabel(c.nom, lang) }))];
  const hidden = new Set((q.hide ?? "").split(",").filter((k) => entities.some((e) => e.key === k)));
  if (hidden.size >= entities.length) hidden.clear();
  const shown = entities.filter((e) => !hidden.has(e.key));
  const toggleHref = (key: string) => {
    const next = hidden.has(key) ? [...hidden].filter((k) => k !== key) : [...hidden, key];
    return href({ hide: next.length ? next.join(",") : undefined });
  };
  const radarSeries: RadarSeries[] = overall
    ? shown.flatMap((e) => {
        const sc = (e.id === null ? whole : getWindowTrends({ ...win, bucket: "all" }, e.id)).series[0];
        return sc ? [{ label: e.label, values: vals(sc), color: e.color }] : [];
      })
    : [];
  const hasData = !!overall && overall.rows.some((r) => r.cells[0]?.mitjana != null);

  const f1 = (x: number) => numD(x, lang, 1);
  const means = overall ? overall.rows.flatMap((r) => (r.cells[0]?.mitjana == null ? [] : [{ d: r.domini, now: r.cells[0].mitjana, n: r.cells[0].n ?? 0 }])) : [];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // A global mark needs most domains visible; with one or two it would be misleading.
  const enough = means.length >= 3;
  const score = enough ? avg(means.map((m) => m.now)) : null;
  const sorted = [...means].sort((a, b) => b.now - a.now);
  const best = enough ? sorted[0] : undefined;
  const worst = enough ? sorted[sorted.length - 1] : undefined;

  // People, not answers: read from the job-written aggregates for the period(s) the window overlaps (never above the population).
  const { pct } = getParticipation(win, col?.id ?? null);
  // Answers: total in the range and the daily average, from the analytics view.
  const apd = getAnswersPerDay(win, col?.id ?? null);
  // Open alarms for the scope, same source and minimum group size as the alarms page's "open" tab.
  const openAlarmRows = hrAlarms({ role: "hr" }, { status: ["open"], ...(col ? { collectiuId: col.id } : {}) }).filter((a) => a.n >= MIN_GROUP_SIZE);
  const openAlarms = openAlarmRows.length;
  const criticalAlarms = openAlarmRows.filter((a) => a.severity === "critical").length;
  const alarmsHref = (gravetat?: string) => {
    const u = new URLSearchParams();
    if (gravetat) u.set("gravetat", gravetat);
    if (col) u.set("collectiu", String(col.id));
    const s = u.toString();
    return `/hr/signals${s ? `?${s}` : ""}`;
  };

  const domValid = q.dom && heatmap.domains.includes(q.dom) ? q.dom : undefined;
  const segmentTrend = getSegmentTrend(seg?.nom, domValid);
  const insights = hrInsights({ role: "hr" }, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 12);
  const trends = series.series;
  const perCollective = trends.slice(1);
  const bucketKey = (b: string) => (b === "day" ? "dash_by_day" : b === "week" ? "dash_by_week" : "dash_by_month") as "dash_by_day";

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { dom: q.dom, r: q.from && q.to ? undefined : range.key === "custom" ? undefined : range.key, from: q.from, to: q.to, c: seg?.nom, hide: q.hide, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "actualitzat") p.set(k, v);
    const s = p.toString();
    return s ? `/hr?${s}` : "/hr";
  };

  return (
    <>
      <PageHeader
        title={t("dash_title")}
        subtitle={<>{t("dash_sub")}<span className="mt-1 block text-xs"><span className="num">{fmtDay(range.from)} – {fmtDay(range.to)}</span>
            {" · "}{t(bucketKey(bucket))}
            {prevWin && <> · {t("dash_vs", { range: `${fmtDay(prevWin.from)} – ${fmtDay(prevWin.to)}` })}</>}
            {range.anchored && <> · {t("dash_anchor", { date: fmtDay(range.anchor) })}</>}</span></>}
        aside={<div aria-label={t("dash_filters")} role="group">
            <RangeSelect
              options={PRESETS.map((p) => ({ key: p.key, label: t(`pr_${p.key}`), href: href({ r: p.key, from: undefined, to: undefined }) }))}
              value={range.key}
              custom={range.key === "custom"}
              base={href({ r: undefined, from: undefined, to: undefined })}
              from={range.from}
              to={range.to}
              min={bounds.min ?? undefined}
              max={range.anchor}
            />
        </div>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action={refreshDashboardAction}>
              {(["r", "from", "to", "c", "dom", "hide"] as const).map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
              <RefreshButton />
            </form>
          </div>
        }
      />

      {q.actualitzat && q.actualitzat in NOTICE_KEY && (
        <p role="status" className="mb-4 border border-line bg-surface-muted px-4 py-2 text-[13px]">{t(NOTICE_KEY[q.actualitzat as keyof typeof NOTICE_KEY])}</p>
      )}


      {!hasData && (
        <div className="mb-6">
          <Empty>{col ? t("dash_empty_col", { col: collectiveLabel(col.nom, lang), min: MIN_GROUP_SIZE }) : t("dash_empty", { min: MIN_GROUP_SIZE })}</Empty>
        </div>
      )}

      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-2 xl:grid-cols-3">
          <Stat
            label={t("kpi_apd")}
            value={apd.total === null ? "—" : numD(apd.total, lang, 0)}
          />
          <Stat label={t("kpi_part")} value={pct === null ? "—" : `${pct}%`} />
          {role === "manager" ? (
            <Stat label={t("kpi_alarms")} value={openAlarms} />
          ) : (
            <Stat
              label={<Link href={alarmsHref()} className="hover:text-ink">{t("kpi_alarms")}</Link>}
              value={<Link href={alarmsHref()} className="hover:underline">{openAlarms}</Link>}
              hint={
                criticalAlarms > 0 ? (
                  <Link href={alarmsHref("critical")} className="font-semibold text-accent hover:underline">{t("kpi_alarms_critical", { n: criticalAlarms })}</Link>
                ) : (
                  t("kpi_alarms_no_critical")
                )
              }
            />
          )}
          <Stat
            label={t("kpi_score")}
            value={score === null ? "—" : <>{f1(score)}<span className="text-base font-normal text-subtle"> / 5</span></>}
          />
          <Stat label={best ? `${t("kpi_best")}: ${domainLabel(best.d, lang)}` : t("kpi_best")} value={best ? <>{f1(best.now)}<span className="text-base font-normal text-subtle"> / 5</span></> : "—"} />
          <Stat label={worst ? `${t("kpi_worst")}: ${domainLabel(worst.d, lang)}` : t("kpi_worst")} value={worst ? <>{f1(worst.now)}<span className="text-base font-normal text-subtle"> / 5</span></> : "—"} />
        </div>

        {/* 1. Profile by domain */}
        <Card title={tr("rs_profile")} meta={<span className="num">{t("dash_prof_full")}</span>}>
          {hasData && (
            <div role="group" aria-label={t("cmp_label")} className="mb-4 flex flex-wrap items-center gap-2">
              {entities.map((e) => {
                const on = !hidden.has(e.key);
                const inner = (
                  <>
                    <span className="hr-chip-dot" style={{ background: on ? e.color : "transparent", boxShadow: `inset 0 0 0 2px ${e.color}` }} aria-hidden />
                    {e.label}
                  </>
                );
                return on && shown.length === 1 ? (
                  <span key={e.key} className="hr-chip" aria-pressed="true" aria-disabled="true">{inner}</span>
                ) : (
                  <Link key={e.key} href={toggleHref(e.key)} scroll={false} className="hr-chip" aria-pressed={on}>{inner}</Link>
                );
              })}
            </div>
          )}
          {radarSeries.length && hasData ? <Radar axes={axes} series={radarSeries} legend={false} /> : <Empty>{tr("rs_nodata")}</Empty>}
        </Card>

        {/* 2. Collectives x domains map */}
        <HeatmapCard
          map={heatmap}
          selected={{ seg: seg?.nom, dom: domValid }}
          cellHref={(collective, domain) => `${href({ c: collective, dom: domain })}#tendencia`}
        />
        <SegmentTrendCard trend={segmentTrend} closeHref={href({ dom: undefined })} />

        {/* Trend + representativeness */}
        <Card title={t("dash_evo")} meta={t(chartBucket === "day" ? "dash_evo_day" : chartBucket === "week" ? "dash_evo_week" : "dash_evo_month")} flush={seriesVisible}>
          {seriesVisible ? (
            <>
              {coarsened && <p className="px-5 pt-3 text-xs text-subtle">{t(chartBucket === "week" ? "dash_coarse_week" : "dash_coarse_month", { min: MIN_GROUP_SIZE })}</p>}
              <TrendChart periodes={series.periodes} rows={series.series[0].rows} />
              <details className="group/all border-t border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-semibold hover:bg-surface-muted">
                  <span aria-hidden className="text-subtle transition-transform group-open/all:rotate-90">›</span>
                  {t("dash_trend_tables")}
                </summary>
                <details className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-3 pl-10 pr-5 font-semibold hover:bg-surface-muted">
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                    {tr("rs_show_table")}
                  </summary>
                  <p className="border-t border-line px-5 py-3 text-xs text-subtle">
                    {tr("rs_prec_a")}<span className="font-semibold">{tr("prec_indicativa")}</span>{tr("rs_prec_b", { a: PRECISION_MODERADA_MIN_N })}
                    <span className="font-semibold">{tr("prec_moderada")}</span>{tr("rs_prec_c", { a: PRECISION_MODERADA_MIN_N, b: PRECISION_SOLIDA_MIN_N - 1 })}
                    <span className="font-semibold">{tr("prec_solida")}</span>{tr("rs_prec_d", { c: PRECISION_SOLIDA_MIN_N, delta: numD(CHANGE_MIN_DELTA, lang, 1), n: CHANGE_MIN_N })}
                  </p>
                  <TrendTable periodes={series.periodes} rows={series.series[0].rows} />
                </details>
                {perCollective.map((s) => (
                  <details key={s.scope} className="group border-t border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-2 py-3 pl-10 pr-5 font-semibold hover:bg-surface-muted">
                      <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                      {collectiveLabel(s.scope, lang)}
                    </summary>
                    <TrendTable periodes={series.periodes} rows={s.rows} />
                  </details>
                ))}
              </details>
            </>
          ) : (
            <Empty>{t(col ? "dash_evo_empty_col" : "dash_evo_empty", { min: MIN_GROUP_SIZE })}</Empty>
          )}
        </Card>

        <Card title={t("dash_rep")} meta={<Link href="/hr/methodology" className="underline">{tr("rs_rep_how")}</Link>} flush={rep.collectius.length > 0}>
          {rep.collectius.length === 0 ? (
            <Empty>{tr("rs_nodata")}</Empty>
          ) : (
            <>
              <RepTable rows={rep.collectius} byShift={false} />
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-semibold hover:bg-surface-muted">
                  <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  {tr("rs_by_shift")}
                </summary>
                <RepTable rows={rep.torns} byShift />
              </details>
            </>
          )}
        </Card>

        {/* Everything else: collapsed by default */}
        <NarrativeCard fold narrative={getNarrative(col?.nom ?? "All", lang)} title={t("dash_narr", { scope: col ? collectiveLabel(col.nom, lang) : t("dash_scope_all") })} />
        <HeadlineStrip fold headlines={getHeadlines()} />
        <ReachCard fold gaps={getReachGaps(4)} />
        <Card fold title={tr("rs_engine")} meta={<span className="num">{insights.length}</span>}>
          <InsightCards insights={insights} empty={tr("rs_engine_empty", { min: MIN_GROUP_SIZE })} />
        </Card>
        {role === "hr" && <ProposalsCard fold proposals={getProposals()} />}
      </div>
    </>
  );
}
