import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import {
  accountCounts,
  getDataBounds,
  getRepresentativeness,
  getWindowTrends,
  listCollectius,
  listNeedCards,
  listThemes,
  populationOf,
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { hrInsights } from "@/lib/hr-engine";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { hrDashboardDict } from "@/lib/i18n/hr-dashboard";
import { collectiveLabel, domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { Card, Empty, PageHeader, Stat } from "./ui";
import { People } from "./glyphs";
import { TrendChart } from "./trend-chart";
import { Radar, type RadarSeries } from "./radar";
import { RepTable, TrendTable } from "./tables";
import { InsightCards } from "./insight-cards";
import { getHeadlines, getHeatmap, getNarrative, getProposals, getReachGaps, getSegmentTrend, getThemesByDomain } from "./analytics";
import { HeadlineStrip, HeatmapCard, NarrativeCard, ProposalsCard, ReachCard, SegmentTrendCard, ThemesCard } from "./analytics-ui";
import { PRESETS, bucketFor, fmtDay, previousWindow, resolveRange } from "./range";
import { refreshDashboardAction } from "./actions";
import { RefreshButton } from "./refresh-button";
import { RangeSelect } from "./range-select";
import { NavSelect } from "./nav-select";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_home");

export const dynamic = "force-dynamic";

type Params = { r?: string; from?: string; to?: string; c?: string; dom?: string; actualitzat?: string };

const NOTICE_KEY = { ok: "notice_ok", "sense-llm": "notice_no_llm", ocupat: "notice_busy", fallada: "notice_failed" } as const;

export default async function HrDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  const { t: tr, lang } = await getTL(hrResultsDict);
  const { t } = await getTL(hrDashboardDict);
  const collectius = listCollectius();
  const col = collectius.find((c) => c.nom === q.c) ?? null;

  const bounds = getDataBounds();
  const range = resolveRange(q, bounds, new Date().toISOString().slice(0, 10));
  const bucket = bucketFor(range.from, range.to);
  const win = { from: range.from, to: range.to };
  const prevWin = range.key === "all" ? null : previousWindow(range.from, range.to, bounds.min);

  const whole = getWindowTrends({ ...win, bucket: "all" }, col?.id ?? null);
  const wholePrev = prevWin ? getWindowTrends({ ...prevWin, bucket: "all" }, col?.id ?? null) : null;
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

  const needs = listNeedCards();
  const drafts = needs.filter((n) => n.state === "esborrany" || n.state === "llesta").length;
  const live = needs.filter((n) => n.state === "publicada").length;
  const rep = getRepresentativeness();
  const themes = listThemes().filter((th) => !th.suprimit);
  const heatmap = { ...getHeatmap(everyone), periode: `${fmtDay(range.from)} – ${fmtDay(range.to)}` };

  const overall = whole.series[0];
  const overallPrev = wholePrev?.series[0];
  const axes = overall ? overall.rows.map((r) => r.domini) : [];
  const vals = (sc: typeof overall) => (sc ? sc.rows.map((r) => r.cells[0]?.mitjana ?? null) : []);
  const label = col ? collectiveLabel(col.nom, lang) : tr("rs_all");
  const radarSeries: RadarSeries[] = overall
    ? [
        { label: `${label} · ${t("dash_now")}`, values: vals(overall), color: "var(--co-1)" },
        ...(overallPrev ? [{ label: `${label} · ${t("dash_before")}`, values: vals(overallPrev), color: "var(--co-1)", dashed: true } as RadarSeries] : []),
      ]
    : [];
  const hasData = !!overall && overall.rows.some((r) => r.cells[0]?.mitjana != null);

  const f1 = (x: number) => numD(x, lang, 1);
  const means = overall ? overall.rows.flatMap((r) => (r.cells[0]?.mitjana == null ? [] : [{ d: r.domini, now: r.cells[0].mitjana, n: r.cells[0].n ?? 0 }])) : [];
  const prevMeans = overallPrev ? overallPrev.rows.flatMap((r) => (r.cells[0]?.mitjana == null ? [] : [r.cells[0].mitjana])) : [];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // A global mark needs most domains visible; with one or two it would be misleading.
  const enough = means.length >= 3;
  const score = enough ? avg(means.map((m) => m.now)) : null;
  const prevScore = enough && prevMeans.length >= 3 ? avg(prevMeans) : null;
  const delta = score !== null && prevScore !== null ? score - prevScore : null;
  const sorted = [...means].sort((a, b) => b.now - a.now);
  const best = enough ? sorted[0] : undefined;
  const worst = enough ? sorted[sorted.length - 1] : undefined;

  const respondents = means.length ? Math.max(...means.map((m) => m.n)) : null;
  const population = populationOf(col?.id ?? null);
  const pct = respondents !== null && population ? Math.min(100, Math.round((respondents / population) * 100)) : null;
  const counts = accountCounts();
  const accountsRaw = col ? (counts.find((c) => c.collectiu === col.nom)?.comptes ?? null) : counts.every((c) => c.comptes !== null) ? counts.reduce((a, c) => a + (c.comptes ?? 0), 0) : null;
  const suppressed = heatmap.cells.flat().filter((c) => c.suppressed).length;

  const domValid = q.dom && heatmap.domains.includes(q.dom) ? q.dom : undefined;
  const segmentTrend = getSegmentTrend(col?.nom, domValid);
  const insights = hrInsights({ role: "hr" }, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 12);
  const trends = series.series;
  const perCollective = trends.slice(1);
  const bucketKey = (b: string) => (b === "day" ? "dash_by_day" : b === "week" ? "dash_by_week" : "dash_by_month") as "dash_by_day";

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { dom: q.dom, r: q.from && q.to ? undefined : range.key === "custom" ? undefined : range.key, from: q.from, to: q.to, c: col?.nom, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "actualitzat") p.set(k, v);
    const s = p.toString();
    return s ? `/hr?${s}` : "/hr";
  };

  return (
    <>
      <PageHeader
        title={t("dash_title")}
        subtitle={t("dash_sub")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action={refreshDashboardAction}>
              {(["r", "from", "to", "c", "dom"] as const).map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
              <RefreshButton />
            </form>
            <a href="/hr/results/export" className="btn" download>{tr("rs_export")}</a>
          </div>
        }
      />

      {q.actualitzat && q.actualitzat in NOTICE_KEY && (
        <p role="status" className="mb-4 border border-line bg-surface-muted px-4 py-2 text-[13px]">{t(NOTICE_KEY[q.actualitzat as keyof typeof NOTICE_KEY])}</p>
      )}

      {/* Filters */}
      <section aria-label={t("dash_filters")} className="card mb-6">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
            <NavSelect
              label={t("dash_collective")}
              value={col?.nom ?? "all"}
              options={[{ key: "all", label: tr("rs_all"), href: href({ c: undefined }) }, ...collectius.map((c) => ({ key: c.nom, label: collectiveLabel(c.nom, lang), href: href({ c: c.nom }) }))]}
            />
          </div>
          <p className="text-xs text-subtle">
            <span className="num">{fmtDay(range.from)} – {fmtDay(range.to)}</span>
            {" · "}{t(bucketKey(bucket))}
            {prevWin && <> · {t("dash_vs", { range: `${fmtDay(prevWin.from)} – ${fmtDay(prevWin.to)}` })}</>}
            {range.anchored && <> · {t("dash_anchor", { date: fmtDay(range.anchor) })}</>}
          </p>
        </div>
      </section>

      {!hasData && (
        <div className="mb-6">
          <Empty>{col ? t("dash_empty_col", { col: collectiveLabel(col.nom, lang), min: MIN_GROUP_SIZE }) : t("dash_empty", { min: MIN_GROUP_SIZE })}</Empty>
        </div>
      )}

      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="card h-full px-5 py-4">
            <div className="text-xs font-medium text-subtle">{t("kpi_part")}</div>
            <div className="num mt-1 text-2xl font-semibold tracking-tight">{pct === null ? "—" : `${pct}%`}</div>
            <div className="hr-meter mt-2"><span style={{ width: `${pct ?? 0}%` }} /></div>
            <div className="mt-2 text-xs text-subtle"><People n={respondents} scoped={!!col} /> {t("kpi_of", { n: numD(population, lang, 0) })}</div>
          </div>
          <Link href="/hr/needs" className="block h-full">
            <Stat label={t("kpi_needs")} value={live} hint={t(live === 1 ? "kpi_needs_one" : "kpi_needs_many", { n: live, d: drafts })} />
          </Link>
          <Stat
            label={t("kpi_score")}
            value={score === null ? "—" : <>{f1(score)}<span className="text-base font-normal text-subtle"> / 5</span></>}
            hint={delta === null ? (enough ? t("kpi_score_avg") : t("kpi_score_need3")) : <span className={delta < -0.05 ? "text-warn" : delta > 0.05 ? "text-good" : ""}>{t("kpi_vs", { arrow: delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→", d: f1(Math.abs(delta)) })}</span>}
          />
          <Stat label={t("kpi_best")} value={best ? f1(best.now) : "—"} hint={best ? domainLabel(best.d, lang) : "—"} />
          <Stat label={t("kpi_worst")} value={worst ? f1(worst.now) : "—"} hint={worst ? domainLabel(worst.d, lang) : "—"} />
          <Stat label={tr("rs_stat_accounts")} value={accountsRaw === null ? "—" : numD(accountsRaw, lang, 0)} hint={col ? collectiveLabel(col.nom, lang) : tr("rs_stat_collectives", { n: counts.length })} />
          <Stat label={t("kpi_themes")} value={themes.length} hint={t("kpi_themes_hint", { n: themes.filter((th) => th.emergent).length })} />
          <Stat label={tr("rs_stat_supp")} value={suppressed} hint={tr("hint_small", { min: MIN_GROUP_SIZE })} />
        </div>

        {/* Story + profile */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <NarrativeCard narrative={getNarrative(col?.nom ?? "All")} title={t("dash_narr", { scope: col ? collectiveLabel(col.nom, lang) : t("dash_scope_all") })} />
            <HeadlineStrip headlines={getHeadlines()} />
          </div>
          <Card title={tr("rs_profile")} meta={<span className="num">{prevWin ? t("dash_prof_vs") : t("dash_prof_full")}</span>}>
            {radarSeries.length && hasData ? <Radar axes={axes} series={radarSeries} /> : <Empty>{tr("rs_nodata")}</Empty>}
          </Card>
        </div>

        <HeatmapCard
          map={heatmap}
          selected={{ seg: col?.nom, dom: domValid }}
          cellHref={(collective, domain) => `${href({ c: collective, dom: domain })}#tendencia`}
        />
        <SegmentTrendCard trend={segmentTrend} closeHref={href({ dom: undefined })} />

        {/* Trend + representativeness */}
        <Card title={t("dash_evo")} meta={t(chartBucket === "day" ? "dash_evo_day" : chartBucket === "week" ? "dash_evo_week" : "dash_evo_month")} flush={seriesVisible}>
          {seriesVisible ? (
            <>
              {coarsened && <p className="px-5 pt-3 text-xs text-subtle">{t(chartBucket === "week" ? "dash_coarse_week" : "dash_coarse_month", { min: MIN_GROUP_SIZE })}</p>}
              <TrendChart periodes={series.periodes} rows={series.series[0].rows} />
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                  <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  {tr("rs_show_table")}
                </summary>
                <p className="border-t border-line px-5 py-3 text-xs text-subtle">
                  {tr("rs_prec_a")}<span className="font-medium">{tr("prec_indicativa")}</span>{tr("rs_prec_b", { a: PRECISION_MODERADA_MIN_N })}
                  <span className="font-medium">{tr("prec_moderada")}</span>{tr("rs_prec_c", { a: PRECISION_MODERADA_MIN_N, b: PRECISION_SOLIDA_MIN_N - 1 })}
                  <span className="font-medium">{tr("prec_solida")}</span>{tr("rs_prec_d", { c: PRECISION_SOLIDA_MIN_N, delta: numD(CHANGE_MIN_DELTA, lang, 1), n: CHANGE_MIN_N })}
                </p>
                <TrendTable periodes={series.periodes} rows={series.series[0].rows} />
              </details>
              {perCollective.map((s) => (
                <details key={s.scope} className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                    {collectiveLabel(s.scope, lang)}
                  </summary>
                  <TrendTable periodes={series.periodes} rows={s.rows} />
                </details>
              ))}
            </>
          ) : (
            <Empty>{t(col ? "dash_evo_empty_col" : "dash_evo_empty", { min: MIN_GROUP_SIZE })}</Empty>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={t("dash_rep")} meta={<Link href="/hr/methodology" className="underline">{tr("rs_rep_how")}</Link>} flush={rep.collectius.length > 0}>
            {rep.collectius.length === 0 ? (
              <Empty>{tr("rs_nodata")}</Empty>
            ) : (
              <>
                <RepTable rows={rep.collectius} byShift={false} />
                <details className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                    {tr("rs_by_shift")}
                  </summary>
                  <RepTable rows={rep.torns} byShift />
                </details>
              </>
            )}
          </Card>
          <ReachCard gaps={getReachGaps(4)} />
        </div>

        {/* Engine insights, comment themes and proposed actions */}
        <Card title={tr("rs_engine")} meta={<span className="num">{insights.length}</span>}>
          <InsightCards insights={insights} empty={tr("rs_engine_empty", { min: MIN_GROUP_SIZE })} />
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <ThemesCard groups={getThemesByDomain(heatmap.domains)} />
          <ProposalsCard proposals={getProposals()} />
        </div>
      </div>
    </>
  );
}
