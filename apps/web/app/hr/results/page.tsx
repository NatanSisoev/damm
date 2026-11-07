import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { Radar, type RadarSeries } from "./radar";
import { Card, Empty, PageHeader, Stat, SuppressedBadge } from "../ui";
import { RepTable, TrendTable, suppressedHint } from "./tables";
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
function radarData(trends: ReturnType<typeof getTrends>, c: string | undefined, prev: boolean, legacyVs: string | undefined) {
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
  const series: RadarSeries[] = picked.map((k) => ({ label: `${k} · ${latest}`, values: valuesFor(known.get(k)!, last), color: COHORT_COLOR[k] ?? "var(--co-1)" }));
  if (wantPrev && picked[0]) {
    series.push({ label: `${picked[0]} · ${before}`, values: valuesFor(known.get(picked[0])!, last - 1), color: COHORT_COLOR[picked[0]] ?? "var(--co-1)", dashed: true });
  }

  const chips: Chip[] = all.map((sc) => {
    const on = picked.includes(sc.scope);
    const next = on ? picked.filter((k) => k !== sc.scope) : [...picked, sc.scope];
    const full = !on && picked.length >= cap;
    const lone = on && picked.length === 1;
    return {
      key: sc.scope,
      label: sc.scope,
      color: COHORT_COLOR[sc.scope] ?? "var(--co-1)",
      on,
      disabled: hidden(sc) ? `<${MIN_GROUP_SIZE}` : full ? `màx. ${MAX_SERIES}` : lone ? "mínim 1" : undefined,
      href: href(next, wantPrev),
    };
  });
  const prevChip = hasPrev
    ? { on: wantPrev, href: href(picked, !wantPrev), disabled: !wantPrev && picked.length >= MAX_SERIES ? `màx. ${MAX_SERIES}` : undefined }
    : null;
  return { axes, series, chips, prevChip, prevLabel: before };
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ vs?: string; c?: string; prev?: string; seg?: string; dom?: string }> }) {
  const { vs, c, prev, seg, dom } = await searchParams;
  const rep = getRepresentativeness();
  const trends = getTrends();
  const themes = listThemes();
  const counts = accountCounts();
  const insights = hrInsights({ role: "hr" }, { kind: ["top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"] }).slice(0, 12);
  const [overall, ...perCollective] = trends.series;

  const allVisible = counts.every((c) => c.comptes !== null);
  const totalAccounts = allVisible ? counts.reduce((a, c) => a + (c.comptes ?? 0), 0) : null;
  const visibleThemes = themes.filter((t) => !t.suprimit);
  const emergent = visibleThemes.filter((t) => t.emergent).length;
  const suppressedSegments = [...rep.collectius, ...rep.torns].filter((r) => r.suprimit).length;
  const radar = overall ? radarData(trends, c, prev === "1", vs) : null;

  const heatmap = getHeatmap();
  const segValid = seg && heatmap.collectives.includes(seg) ? seg : undefined;
  const domValid = dom && heatmap.domains.includes(dom) ? dom : undefined;
  const segmentTrend = getSegmentTrend(segValid, domValid);
  const companyNarrative = getNarrative("All");
  const segNarrative = segValid ? getNarrative(segValid) : null;

  return (
    <>
      <PageHeader
        title="Resultats"
        subtitle={<>Sempre en agregat. Els segments amb menys de {MIN_GROUP_SIZE} persones que han respost es mostren com a <span className="font-medium text-muted">Suprimit</span>.</>}
        actions={
          <>
            {rep.periode && <span className="badge num">{rep.periode}</span>}
            <a href="/hr/results/export" className="btn" download>Exporta CSV</a>
          </>
        }
      />

      <div className="space-y-6">
        <HeadlineStrip headlines={getHeadlines()} />
        <NarrativeCard narrative={companyNarrative} title="Resum de l'anàlisi · tota l'empresa" />
        <HeatmapCard map={heatmap} selected={{ seg: segValid, dom: domValid }} />
        <SegmentTrendCard trend={segmentTrend} />
        {segValid && <NarrativeCard narrative={segNarrative} title={`Resum de l'anàlisi · ${segValid}`} />}
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
          <h2 className="section-title">Dades detallades</h2>
          <span className="text-xs text-subtle">Taules, perfil per domini, representativitat i tendències</span>
        </summary>
        <div className="card-body">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Comptes actius" value={totalAccounts ?? "—"} hint={allVisible ? `${counts.length} col·lectius` : `Algun col·lectiu té menys de ${MIN_GROUP_SIZE} comptes`} />
        <Stat label="Temes detectats" value={visibleThemes.length} hint="Als comentaris" />
        <Stat label="Temes emergents" value={emergent} hint="Nous aquest període" />
        <Stat label="Segments suprimits" value={suppressedSegments} hint={suppressedHint} />
      </div>

      <Card title="Què destaca el motor" meta={<span className="num">{insights.length}</span>} className="mt-6">
        <InsightCards insights={insights} empty="Encara no hi ha prou respostes per destacar res (cal 👤≥10)." />
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title={<span id="perfil">Perfil per domini</span>}
          meta="Mitjana per domini"
        >
          {radar ? (
            <div className="space-y-4">
              <nav aria-label="Filtra per col·lectiu" className="flex flex-wrap gap-2">
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
                    Període anterior ({radar.prevLabel})
                    {radar.prevChip.disabled && <span className="text-xs text-subtle">{radar.prevChip.disabled}</span>}
                  </Link>
                )}
              </nav>
              <Radar axes={radar.axes} series={radar.series} />
            </div>
          ) : (
            <Empty>Encara no hi ha dades.</Empty>
          )}
        </Card>

        <Card title="Temes dels comentaris" meta={<span className="num">{themes.length}</span>}>
          {themes.length === 0 ? (
            <Empty>Encara no hi ha temes.</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-line">
              {themes.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.suprimit ? <SuppressedBadge title={`Menys de ${MIN_GROUP_SIZE} comentaris`} /> : <span className="font-medium">{t.etiqueta}</span>}
                    {t.emergent && !t.suprimit && <span className="badge badge-accent">Emergent</span>}
                    <span className="num ml-auto text-xs text-subtle">{t.periode}{t.n !== null ? ` · ${t.n}` : ""}</span>
                  </div>
                  {t.resum && <p className="mt-1 text-[13px] text-muted">{t.resum}</p>}
                  {t.suprimit && <p className="mt-1 text-xs text-subtle">Menys de {MIN_GROUP_SIZE} comentaris: tema ocult.</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card
          title="Representativitat"
          meta={<>Respostes davant població sintètica · diferències de 5 pp o més marcades · <Link href="/hr/methodology" className="underline">Com es calcula?</Link></>}
          flush={rep.collectius.length > 0}
        >
          {rep.collectius.length === 0 ? (
            <Empty>Encara no hi ha dades.</Empty>
          ) : (
            <>
              <RepTable rows={rep.collectius} byShift={false} />
              <div className="border-t border-line px-5 pt-5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Per torn</div>
              <RepTable rows={rep.torns} byShift />
            </>
          )}
        </Card>

        <Card title="Tendència per domini" meta="Mitjana 1–5 per període · tots els col·lectius" flush={!!overall}>
          {overall ? (
            <>
              <TrendChart periodes={trends.periodes} rows={overall.rows} />
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                  <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  Veure taula
                </summary>
              <p className="border-t border-line px-5 py-3 text-xs text-subtle">
                Cada mitjana mostra la seva n i una precisió: <span className="font-medium">indicativa</span> (n &lt; {PRECISION_MODERADA_MIN_N}),{" "}
                <span className="font-medium">moderada</span> ({PRECISION_MODERADA_MIN_N}–{PRECISION_SOLIDA_MIN_N - 1}) o{" "}
                <span className="font-medium">sòlida</span> (n ≥ {PRECISION_SOLIDA_MIN_N}). Un canvi només és «puja» o «baixa» si |Δ| ≥ {CHANGE_MIN_DELTA} i els dos períodes tenen n ≥ {CHANGE_MIN_N}; si no, «sense canvi clar».
              </p>
              <TrendTable periodes={trends.periodes} rows={overall.rows} />
              </details>
              {perCollective.map((s) => (
                <details key={s.scope} className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 font-medium hover:bg-surface-muted">
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                    {s.scope}
                  </summary>
                  <TrendTable periodes={trends.periodes} rows={s.rows} />
                </details>
              ))}
            </>
          ) : (
            <Empty>Encara no hi ha dades.</Empty>
          )}
        </Card>

        <Card title="Comptes per col·lectiu" meta="Només recomptes, mai identitats">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {counts.map((c) => (
              <div key={c.collectiu}>
                <dt className="text-xs text-subtle">{c.collectiu}</dt>
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
