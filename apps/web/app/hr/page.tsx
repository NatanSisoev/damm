import Link from "next/link";
import { accountCounts, getDataBounds, getRepresentativeness, getWindowTrends, listCollectius, listNeedCards, listThemes, populationOf } from "@damm/db/hr";
import { Card, Empty, PageHeader, Stat } from "./ui";
import { People } from "./glyphs";
import { TrendChart } from "./trend-chart";
import { Radar, type RadarSeries } from "./results/radar";
import { RepTable } from "./results/tables";
import { getHeadlines, getHeatmap, getNarrative, getReachGaps } from "./analytics";
import { HeadlineStrip, HeatmapCard, NarrativeCard, ReachCard } from "./analytics-ui";
import { PRESETS, bucketFor, fmtDay, previousWindow, resolveRange } from "./range";
import { refreshDashboardAction } from "./actions";
import { RefreshButton } from "./refresh-button";
import { RangeSelect } from "./range-select";
import { NavSelect } from "./nav-select";

export const dynamic = "force-dynamic";

type Params = { r?: string; from?: string; to?: string; c?: string; actualitzat?: string };

const NOTICE: Record<string, string> = {
  ok: "Dades i resum actualitzats.",
  "sense-llm": "Dades actualitzades. El resum de la IA no s'ha pogut regenerar: falta LLM_API_KEY al servidor.",
  ocupat: "Dades actualitzades. El resum ja s'estava generant; torna-hi d'aquí uns minuts.",
  fallada: "Dades actualitzades, però el model no ha pogut escriure el resum. Torna-ho a provar.",
};

export default async function HrDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
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
  const themes = listThemes().filter((t) => !t.suprimit);
  const heatmap = { ...getHeatmap(everyone), periode: `${fmtDay(range.from)} – ${fmtDay(range.to)}` };

  const overall = whole.series[0];
  const overallPrev = wholePrev?.series[0];
  const axes = overall ? overall.rows.map((r) => r.domini) : [];
  const vals = (sc: typeof overall) => (sc ? sc.rows.map((r) => r.cells[0]?.mitjana ?? null) : []);
  const label = col?.nom ?? "Tots";
  const radarSeries: RadarSeries[] = overall
    ? [
        { label: `${label} · ara`, values: vals(overall), color: "var(--co-1)" },
        ...(overallPrev ? [{ label: `${label} · abans`, values: vals(overallPrev), color: "var(--co-1)", dashed: true } as RadarSeries] : []),
      ]
    : [];
  const hasData = !!overall && overall.rows.some((r) => r.cells[0]?.mitjana != null);

  const f1 = (x: number) => x.toFixed(1).replace(".", ",");
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

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { r: q.from && q.to ? undefined : range.key === "custom" ? undefined : range.key, from: q.from, to: q.to, c: col?.nom, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "actualitzat") p.set(k, v);
    const s = p.toString();
    return s ? `/hr?${s}` : "/hr";
  };

  return (
    <>
      <PageHeader
        title="Panell"
        subtitle="Estat de l'escolta: què diuen les dades per a l'interval i el col·lectiu triats."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action={refreshDashboardAction}>
              {(["r", "from", "to", "c"] as const).map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
              <RefreshButton />
            </form>
            <Link href="/hr/results" className="btn">Resultats detallats</Link>
            <a href="/hr/results/export" className="btn" download>Exporta CSV</a>
          </div>
        }
      />

      {q.actualitzat && NOTICE[q.actualitzat] && (
        <p role="status" className="mb-4 border border-line bg-surface-muted px-4 py-2 text-[13px]">{NOTICE[q.actualitzat]}</p>
      )}

      {/* Filters */}
      <section aria-label="Filtres" className="card mb-6">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <RangeSelect
              options={PRESETS.map((p) => ({ key: p.key, label: p.label, href: href({ r: p.key, from: undefined, to: undefined }) }))}
              value={range.key}
              custom={range.key === "custom"}
              base={href({ r: undefined, from: undefined, to: undefined })}
              from={range.from}
              to={range.to}
              min={bounds.min ?? undefined}
              max={range.anchor}
            />
            <NavSelect
              label="Col·lectiu"
              value={col?.nom ?? "all"}
              options={[{ key: "all", label: "Tots", href: href({ c: undefined }) }, ...collectius.map((c) => ({ key: c.nom, label: c.nom, href: href({ c: c.nom }) }))]}
            />
          </div>
          <p className="text-xs text-subtle">
            <span className="num">{fmtDay(range.from)} – {fmtDay(range.to)}</span>
            {" · "}{bucket === "day" ? "per dies" : bucket === "week" ? "per setmanes" : "per mesos"}
            {prevWin && <> · comparat amb <span className="num">{fmtDay(prevWin.from)} – {fmtDay(prevWin.to)}</span></>}
            {range.anchored && <> · «Avui» és l&apos;última resposta rebuda ({fmtDay(range.anchor)})</>}
          </p>
        </div>
      </section>

      {!hasData && (
        <div className="mb-6">
          <Empty>Cap resultat visible en aquest interval{col ? ` per a ${col.nom}` : ""}: no hi ha respostes, o són de menys de 10 persones. Prova un interval més ampli.</Empty>
        </div>
      )}

      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="card h-full px-5 py-4">
            <div className="text-xs font-medium text-subtle">Participació</div>
            <div className="num mt-1 text-2xl font-semibold tracking-tight">{pct === null ? "—" : `${pct}%`}</div>
            <div className="hr-meter mt-2"><span style={{ width: `${pct ?? 0}%` }} /></div>
            <div className="mt-2 text-xs text-subtle"><People n={respondents} scoped={!!col} /> de {population.toLocaleString("ca-ES")}</div>
          </div>
          <Link href="/hr/needs" className="block h-full">
            <Stat label="Consultes" value={live} hint={`${live === 1 ? "activa" : "actives"} · ${drafts} per revisar o publicar`} />
          </Link>
          <Stat
            label="Nota global"
            value={score === null ? "—" : <>{f1(score)}<span className="text-base font-normal text-subtle"> / 5</span></>}
            hint={delta === null ? (enough ? "Mitjana dels dominis" : "Cal veure 3 dominis o més") : <span className={delta < -0.05 ? "text-warn" : delta > 0.05 ? "text-good" : ""}>{delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→"} {f1(Math.abs(delta))} vs interval anterior</span>}
          />
          <Stat label="Domini més fort" value={best ? f1(best.now) : "—"} hint={best?.d ?? "—"} />
          <Stat label="Domini més fluix" value={worst ? f1(worst.now) : "—"} hint={worst?.d ?? "—"} />
          <Stat label="Comptes actius" value={accountsRaw === null ? "—" : accountsRaw.toLocaleString("ca-ES")} hint={col ? col.nom : `${counts.length} col·lectius`} />
          <Stat label="Temes als comentaris" value={themes.length} hint={`${themes.filter((t) => t.emergent).length} d'emergents · darrer període`} />
          <Stat label="Segments suprimits" value={suppressed} hint="Menys de 10 persones" />
        </div>

        {/* Story + profile */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <NarrativeCard narrative={getNarrative(col?.nom ?? "All")} title={`Resum de l'anàlisi · ${col ? col.nom : "tota l'empresa"} · darrer període`} />
            <HeadlineStrip headlines={getHeadlines()} />
          </div>
          <Card title="Perfil per domini" meta={<span className="num">{prevWin ? "ara vs abans" : "interval complet"}</span>}>
            {radarSeries.length && hasData ? <Radar axes={axes} series={radarSeries} /> : <Empty>Encara no hi ha dades.</Empty>}
          </Card>
        </div>

        <HeatmapCard map={heatmap} selected={col ? { seg: col.nom } : undefined} />

        {/* Trend + representativeness */}
        <Card title="Evolució per domini" meta={`Mitjana 1–5 ${chartBucket === "day" ? "per dia" : chartBucket === "week" ? "per setmana" : "per mes"}`} flush={seriesVisible}>
          {seriesVisible ? (
            <>
              {coarsened && <p className="px-5 pt-3 text-xs text-subtle">Agrupat {chartBucket === "week" ? "per setmanes" : "per mesos"}: amb l&apos;agrupació fina hi ha menys de 10 persones per punt.</p>}
              <TrendChart periodes={series.periodes} rows={series.series[0].rows} />
            </>
          ) : (
            <Empty>Cap punt visible: en aquest interval hi ha menys de 10 persones per domini. Amplia l&apos;interval{col ? " o tria «Tots»" : ""}.</Empty>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Representativitat · darrer període" meta={<Link href="/hr/methodology" className="underline">Com es calcula?</Link>} flush={rep.collectius.length > 0}>
            {rep.collectius.length === 0 ? <Empty>Encara no hi ha dades.</Empty> : <RepTable rows={rep.collectius} byShift={false} />}
          </Card>
          <ReachCard gaps={getReachGaps(4)} />
        </div>
      </div>
    </>
  );
}
