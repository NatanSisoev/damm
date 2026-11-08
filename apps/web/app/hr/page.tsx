import Link from "next/link";
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
import { NavSelect } from "./nav-select";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_home");

export const dynamic = "force-dynamic";

const MAX_CMP = 3;

type Params = { r?: string; from?: string; to?: string; c?: string; dom?: string; cmp?: string; actualitzat?: string };

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

  const rep = getRepresentativeness();
  const heatmap = { ...getHeatmap(everyone), periode: `${fmtDay(range.from)} – ${fmtDay(range.to)}` };

  const overall = whole.series[0];
  const overallPrev = wholePrev?.series[0];
  const axes = overall ? overall.rows.map((r) => r.domini) : [];
  const vals = (sc: typeof overall) => (sc ? sc.rows.map((r) => r.cells[0]?.mitjana ?? null) : []);
  const label = col ? collectiveLabel(col.nom, lang) : tr("rs_all");
  // Comparison: the company and the collectives other than the one shown, up to MAX_CMP. Each entity keeps its own colour token.
  const COMPANY = "Tots";
  const shownKey = col?.nom ?? COMPANY;
  const entities = [{ key: COMPANY, id: null as number | null, color: "var(--co-1)", label: tr("rs_all") }, ...collectius.map((c, i) => ({ key: c.nom, id: c.id as number | null, color: `var(--co-${i + 2})`, label: collectiveLabel(c.nom, lang) }))];
  const options = entities.filter((e) => e.key !== shownKey);
  const selected = [...new Set((q.cmp ?? "").split(",").filter(Boolean))].filter((k) => options.some((o) => o.key === k)).slice(0, MAX_CMP);
  const comparing = selected.length > 0;
  const shownColor = entities.find((e) => e.key === shownKey)?.color ?? "var(--co-1)";
  const cmpSeries: RadarSeries[] = selected.flatMap((k) => {
    const e = options.find((o) => o.key === k)!;
    const sc = (e.id === null ? everyone : getWindowTrends({ ...win, bucket: "all" }, e.id)).series[0];
    return sc ? [{ label: e.label, values: vals(sc), color: e.color }] : [];
  });
  const cmpHref = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    return href({ cmp: next.length ? next.join(",") : undefined });
  };
  const radarSeries: RadarSeries[] = overall
    ? [
        { label: comparing ? label : `${label} · ${t("dash_now")}`, values: vals(overall), color: shownColor },
        ...cmpSeries,
        ...(!comparing && overallPrev ? [{ label: `${label} · ${t("dash_before")}`, values: vals(overallPrev), color: shownColor, dashed: true } as RadarSeries] : []),
      ]
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
  const openAlarms = hrAlarms({ role: "hr" }, { status: ["open"], ...(col ? { collectiuId: col.id } : {}) }).filter((a) => a.n >= MIN_GROUP_SIZE).length;

  const domValid = q.dom && heatmap.domains.includes(q.dom) ? q.dom : undefined;
  const segmentTrend = getSegmentTrend(col?.nom, domValid);
  const insights = hrInsights({ role: "hr" }, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 12);
  const trends = series.series;
  const perCollective = trends.slice(1);
  const bucketKey = (b: string) => (b === "day" ? "dash_by_day" : b === "week" ? "dash_by_week" : "dash_by_month") as "dash_by_day";

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { dom: q.dom, r: q.from && q.to ? undefined : range.key === "custom" ? undefined : range.key, from: q.from, to: q.to, c: col?.nom, cmp: q.cmp, ...over };
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
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-2 xl:grid-cols-3">
          <Stat
            label={t("kpi_apd")}
            value={apd.total === null ? "—" : numD(apd.total, lang, 0)}
          />
          <div className="card h-full px-5 py-4">
            <div className="text-xs font-medium text-subtle">{t("kpi_part")}</div>
            <div className="num mt-1 text-2xl font-semibold tracking-tight">{pct === null ? "—" : `${pct}%`}</div>
            <div className="hr-meter mt-2"><span style={{ width: `${pct ?? 0}%` }} /></div>
          </div>
          <Link href={col ? `/hr/signals?collectiu=${col.id}` : "/hr/signals"} className="block h-full">
            <Stat label={t("kpi_alarms")} value={openAlarms} />
          </Link>
          <Stat
            label={t("kpi_score")}
            value={score === null ? "—" : <>{f1(score)}<span className="text-base font-normal text-subtle"> / 5</span></>}
          />
          <Stat label={best ? `${t("kpi_best")}: ${domainLabel(best.d, lang)}` : t("kpi_best")} value={best ? <>{f1(best.now)}<span className="text-base font-normal text-subtle"> / 5</span></> : "—"} />
          <Stat label={worst ? `${t("kpi_worst")}: ${domainLabel(worst.d, lang)}` : t("kpi_worst")} value={worst ? <>{f1(worst.now)}<span className="text-base font-normal text-subtle"> / 5</span></> : "—"} />
        </div>

        {/* 1. Profile by domain */}
        <Card title={tr("rs_profile")} meta={<span className="num">{prevWin ? t("dash_prof_vs") : t("dash_prof_full")}</span>}>
          {hasData && options.length > 0 && (
            <div role="group" aria-label={t("cmp_label")} className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-subtle">{t("cmp_label")}</span>
              {options.map((o) => {
                const on = selected.includes(o.key);
                const full = !on && selected.length >= MAX_CMP;
                const inner = (
                  <>
                    <span className="hr-chip-dot" style={{ background: o.color }} aria-hidden />
                    {o.label}
                  </>
                );
                return full ? (
                  <span key={o.key} className="hr-chip" aria-disabled="true" title={t("cmp_max", { n: MAX_CMP })}>{inner}</span>
                ) : (
                  <Link key={o.key} href={cmpHref(o.key)} scroll={false} className="hr-chip" aria-pressed={on}>{inner}</Link>
                );
              })}
            </div>
          )}
          {radarSeries.length && hasData ? <Radar axes={axes} series={radarSeries} /> : <Empty>{tr("rs_nodata")}</Empty>}
        </Card>

        {/* 2. Collectives x domains map */}
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

        {/* Everything else: collapsed by default */}
        <NarrativeCard fold narrative={getNarrative(col?.nom ?? "All", lang)} title={t("dash_narr", { scope: col ? collectiveLabel(col.nom, lang) : t("dash_scope_all") })} />
        <HeadlineStrip fold headlines={getHeadlines()} />
        <ReachCard fold gaps={getReachGaps(4)} />
        <Card fold title={tr("rs_engine")} meta={<span className="num">{insights.length}</span>}>
          <InsightCards insights={insights} empty={tr("rs_engine_empty", { min: MIN_GROUP_SIZE })} />
        </Card>
        <ProposalsCard fold proposals={getProposals()} />
      </div>
    </>
  );
}
