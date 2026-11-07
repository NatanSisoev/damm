import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { Radar, type RadarSeries } from "./radar";
import { Card, Empty, PageHeader, Stat, SuppressedBadge } from "../ui";
import { RepTable, TrendTable } from "./tables";
import { TrendChart } from "../trend-chart";
import {
  accountCounts,
  getRepresentativeness,
  getTrends,
  listThemes,
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { hrInsights } from "@/lib/hr-engine";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsT } from "@/lib/i18n/hr-results";
import { collectiveLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import type { Lang } from "@damm/shared";
import { InsightCards } from "../insight-cards";
import { getHeadlines, getHeatmap, getNarrative, getProposals, getReachGaps, getSegmentTrend, getThemesByDomain } from "../analytics";
import { HeadlineStrip, HeatmapCard, NarrativeCard, ProposalsCard, ReachCard, SegmentTrendCard, ThemesCard } from "../analytics-ui";

// Fixed colour per entity (var(--co-N) in hr.css), never by rank or selection order.
const COHORT_COLOR: Record<string, string> = {
  Tots: "var(--co-1)",
  "Fàbriques": "var(--co-2)",
  "Logística": "var(--co-3)",
  Comercial: "var(--co-4)",
  Oficines: "var(--co-5)",
};
const MAX_SERIES = 4;

type Chip = { key: string; label: string; color: string; on: boolean; disabled?: string; href: string };

/** Radar series and chip state from `?c=Tots,Fàbriques&prev=1`. The latest period is drawn; prev adds the previous period of the first cohort, dashed. */
function radarData(trends: ReturnType<typeof getTrends>, c: string | undefined, prev: boolean, legacyVs: string | undefined, t: HrResultsT, lang: Lang) {
  // "Tots" is the raw company scope; anything else is a collective name. Only the display changes.
  const scopeName = (k: string) => (k === "Tots" ? t("rs_all") : collectiveLabel(k, lang));
  const all = trends.series;
  const last = trends.periodes.length - 1;
  const latest = trends.periodes[last];
  const before = trends.periodes[last - 1];
  const hasPrev = last > 0;
  const hidden = (sc: (typeof all)[number]) => sc.rows.length === 0 || sc.rows.every((r) => r.cells[last]?.mitjana == null);
  const known = new Map(all.map((sc) => [sc.scope, sc]));

  const requested = (c ?? (legacyVs ? `Tots,${legacyVs}` : "Tots")).split(",").map((x) => x.trim()).filter(Boolean);
  const wantPrev = prev && hasPrev;
  const cap = MAX_SERIES - (wantPrev ? 1 : 0);
  const picked = [...new Set(requested)].filter((k) => known.has(k) && !hidden(known.get(k)!)).slice(0, cap);
  if (picked.length === 0 && known.has("Tots")) picked.push("Tots");

  const href = (cohorts: string[], p: boolean) => {
    const q = new URLSearchParams();
    q.set("c", cohorts.join(","));
    if (p) q.set("prev", "1");
    return `?${q.toString()}#perfil`;
  };

  const overall = all[0];
  const axes = overall ? overall.rows.map((r) => r.domini) : [];
  const valuesFor = (sc: (typeof all)[number], k: number) => {
    const byDomain = new Map(sc.rows.map((r) => [r.domini, r.cells[k]?.mitjana ?? null]));
    return axes.map((d) => byDomain.get(d) ?? null);
  };
  const series: RadarSeries[] = picked.map((k) => ({ label: `${scopeName(k)} · ${latest}`, values: valuesFor(known.get(k)!, last), color: COHORT_COLOR[k] ?? "var(--co-1)" }));
  if (wantPrev && picked[0]) {
    series.push({ label: `${scopeName(picked[0])} · ${before}`, values: valuesFor(known.get(picked[0])!, last - 1), color: COHORT_COLOR[picked[0]] ?? "var(--co-1)", dashed: true });
  }

  const chips: Chip[] = all.map((sc) => {
    const on = picked.includes(sc.scope);
    const next = on ? picked.filter((k) => k !== sc.scope) : [...picked, sc.scope];
    const full = !on && picked.length >= cap;
    const lone = on && picked.length === 1;
    return {
      key: sc.scope,
      label: scopeName(sc.scope),
      color: COHORT_COLOR[sc.scope] ?? "var(--co-1)",
      on,
      disabled: hidden(sc) ? `<${MIN_GROUP_SIZE}` : full ? t("rs_max", { n: MAX_SERIES }) : lone ? t("rs_min1") : undefined,
      href: href(next, wantPrev),
    };
  });
  const prevChip = hasPrev
    ? { on: wantPrev, href: href(picked, !wantPrev), disabled: !wantPrev && picked.length >= MAX_SERIES ? t("rs_max", { n: MAX_SERIES }) : undefined }
    : null;
  return { axes, series, chips, prevChip, prevLabel: before };
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ vs?: string; c?: string; prev?: string; seg?: string; dom?: string }> }) {
  const { vs, c, prev, seg, dom } = await searchParams;
  const { t, lang } = await getTL(hrResultsDict);
  const rep = getRepresentativeness();
  const trends = getTrends();
  const themes = listThemes();
  const counts = accountCounts();
  const insights = hrInsights({ role: "hr" }, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 12);
  const [overall, ...perCollective] = trends.series;

  const allVisible = counts.every((c) => c.comptes !== null);
  const totalAccounts = allVisible ? counts.reduce((a, c) => a + (c.comptes ?? 0), 0) : null;
  const visibleThemes = themes.filter((th) => !th.suprimit);
  const emergent = visibleThemes.filter((th) => th.emergent).length;
  const suppressedSegments = [...rep.collectius, ...rep.torns].filter((r) => r.suprimit).length;
  const radar = overall ? radarData(trends, c, prev === "1", vs, t, lang) : null;

  const heatmap = getHeatmap();
  const segValid = seg && heatmap.collectives.includes(seg) ? seg : undefined;
  const domValid = dom && heatmap.domains.includes(dom) ? dom : undefined;
  const segmentTrend = getSegmentTrend(segValid, domValid);
  const companyNarrative = getNarrative("All");
  const segNarrative = segValid ? getNarrative(segValid) : null;

  return (
    <>
      <PageHeader
        title={t("rs_title")}
        subtitle={<>{t("rs_sub_a", { min: MIN_GROUP_SIZE })}<span className="font-medium text-muted">{t("rs_suppressed")}</span>{t("rs_sub_b")}</>}
        actions={
          <>
            {rep.periode && <span className="badge num">{rep.periode}</span>}
            <a href="/hr/results/export" className="btn" download>{t("rs_export")}</a>
          </>
        }
      />

      <div className="space-y-6">
        <HeadlineStrip headlines={getHeadlines()} />
        <NarrativeCard narrative={companyNarrative} title={t("rs_narr_company")} />
        <HeatmapCard map={heatmap} selected={{ seg: segValid, dom: domValid }} />
        <SegmentTrendCard trend={segmentTrend} />
        {segValid && <NarrativeCard narrative={segNarrative} title={t("rs_narr_seg", { seg: collectiveLabel(segValid, lang) })} />}
        <div className="grid gap-6 xl:grid-cols-2">
          <ThemesCard groups={getThemesByDomain(heatmap.domains)} />
          <div className="space-y-6">
            <ReachCard gaps={getReachGaps()} />
            <ProposalsCard proposals={getProposals()} />
          </div>
        </div>
      </div>

      <details className="card group mt-8" open={!!(c || prev || vs)}>
        <summary className="card-header cursor-pointer list-none">
          <h2 className="section-title">{t("rs_details")}</h2>
          <span className="text-xs text-subtle">{t("rs_details_sub")}</span>
        </summary>
        <div className="card-body">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("rs_stat_accounts")} value={totalAccounts ?? "—"} hint={allVisible ? t("rs_stat_collectives", { n: counts.length }) : t("rs_stat_some_small", { min: MIN_GROUP_SIZE })} />
        <Stat label={t("rs_stat_themes")} value={visibleThemes.length} hint={t("rs_stat_themes_hint")} />
        <Stat label={t("rs_stat_emergent")} value={emergent} hint={t("rs_stat_emergent_hint")} />
        <Stat label={t("rs_stat_supp")} value={suppressedSegments} hint={t("hint_small", { min: MIN_GROUP_SIZE })} />
      </div>

      <Card title={t("rs_engine")} meta={<span className="num">{insights.length}</span>} className="mt-6">
        <InsightCards insights={insights} empty={t("rs_engine_empty", { min: MIN_GROUP_SIZE })} />
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title={<span id="perfil">{t("rs_profile")}</span>}
          meta={t("rs_profile_meta")}
        >
          {radar ? (
            <div className="space-y-4">
              <nav aria-label={t("rs_filter_aria")} className="flex flex-wrap gap-2">
                {radar.chips.map((ch) => (
                  <Link
                    key={ch.key}
                    href={ch.href}
                    scroll={false}
                    className="hr-chip"
                    aria-pressed={ch.on}
                    aria-disabled={ch.disabled ? true : undefined}
                    tabIndex={ch.disabled ? -1 : undefined}
                  >
                    <span className="hr-chip-dot" style={{ background: ch.color }} aria-hidden />
                    {ch.label}
                    {ch.disabled && <span className="text-xs text-subtle">{ch.disabled}</span>}
                  </Link>
                ))}
                {radar.prevChip && (
                  <Link
                    href={radar.prevChip.href}
                    scroll={false}
                    className="hr-chip"
                    aria-pressed={radar.prevChip.on}
                    aria-disabled={radar.prevChip.disabled ? true : undefined}
                    tabIndex={radar.prevChip.disabled ? -1 : undefined}
                  >
                    {t("rs_prev", { label: radar.prevLabel })}
                    {radar.prevChip.disabled && <span className="text-xs text-subtle">{radar.prevChip.disabled}</span>}
                  </Link>
                )}
              </nav>
              <Radar axes={radar.axes} series={radar.series} />
            </div>
          ) : (
            <Empty>{t("rs_nodata")}</Empty>
          )}
        </Card>

        <Card title={t("rs_themes")} meta={<span className="num">{themes.length}</span>}>
          {themes.length === 0 ? (
            <Empty>{t("rs_themes_empty")}</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-line">
              {themes.map((th) => (
                <li key={th.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {th.suprimit ? <SuppressedBadge title={t("rs_theme_hidden_title", { min: MIN_GROUP_SIZE })} /> : <span className="font-medium">{th.etiqueta}</span>}
                    {th.emergent && !th.suprimit && <span className="badge badge-accent">{t("rs_emergent")}</span>}
                    <span className="num ml-auto text-xs text-subtle">{th.periode}{th.n !== null ? ` · ${th.n}` : ""}</span>
                  </div>
                  {th.resum && <p className="mt-1 text-[13px] text-muted">{th.resum}</p>}
                  {th.suprimit && <p className="mt-1 text-xs text-subtle">{t("rs_theme_hidden", { min: MIN_GROUP_SIZE })}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title={t("rs_rep")}
          meta={<>{t("rs_rep_meta")}<Link href="/hr/methodology" className="underline">{t("rs_rep_how")}</Link></>}
          flush={rep.collectius.length > 0}
        >
          {rep.collectius.length === 0 ? (
            <Empty>{t("rs_nodata")}</Empty>
          ) : (
            <>
              <RepTable rows={rep.collectius} byShift={false} />
              <div className="border-t border-line px-5 pt-5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{t("rs_by_shift")}</div>
              <RepTable rows={rep.torns} byShift />
            </>
          )}
        </Card>

        <Card title={t("rs_trend")} meta={t("rs_trend_meta")} flush={!!overall}>
          {overall ? (
            <>
              <TrendChart periodes={trends.periodes} rows={overall.rows} />
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                  <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  {t("rs_show_table")}
                </summary>
              <p className="border-t border-line px-5 py-3 text-xs text-subtle">
                {t("rs_prec_a")}<span className="font-medium">{t("prec_indicativa")}</span>{t("rs_prec_b", { a: PRECISION_MODERADA_MIN_N })}
                <span className="font-medium">{t("prec_moderada")}</span>{t("rs_prec_c", { a: PRECISION_MODERADA_MIN_N, b: PRECISION_SOLIDA_MIN_N - 1 })}
                <span className="font-medium">{t("prec_solida")}</span>{t("rs_prec_d", { c: PRECISION_SOLIDA_MIN_N, delta: numD(CHANGE_MIN_DELTA, lang, 1), n: CHANGE_MIN_N })}
              </p>
              <TrendTable periodes={trends.periodes} rows={overall.rows} />
              </details>
              {perCollective.map((s) => (
                <details key={s.scope} className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                    {collectiveLabel(s.scope, lang)}
                  </summary>
                  <TrendTable periodes={trends.periodes} rows={s.rows} />
                </details>
              ))}
            </>
          ) : (
            <Empty>{t("rs_nodata")}</Empty>
          )}
        </Card>

        <Card title={t("rs_accounts")} meta={t("rs_accounts_meta")}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {counts.map((c) => (
              <div key={c.collectiu}>
                <dt className="text-xs text-subtle">{collectiveLabel(c.collectiu, lang)}</dt>
                <dd className="num text-lg font-semibold">{c.comptes === null ? `<${MIN_GROUP_SIZE}` : c.comptes}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
        </div>
      </details>
    </>
  );
}
