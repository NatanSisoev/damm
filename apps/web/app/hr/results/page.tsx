import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { Radar, type RadarSeries } from "./radar";
import { Card, Empty, PageHeader, Stat, SuppressedBadge } from "../ui";
import { RepTable, TrendTable, suppressedHint } from "./tables";
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

function radarData(trends: ReturnType<typeof getTrends>, vs: string | undefined) {
  const [overall, ...perCollective] = trends.series;
  const last = trends.periodes.length - 1;
  const latest = trends.periodes[last];
  const prev = trends.periodes[last - 1];
  const at = (rows: typeof overall.rows, k: number) => rows.map((r) => r.cells[k]?.mitjana ?? null);
  const other = perCollective.find((s) => s.scope === vs);

  const series: RadarSeries[] = [{ label: `Tots · ${latest}`, values: at(overall.rows, last), tone: "primary" }];
  if (other) {
    const byDomain = new Map(other.rows.map((r) => [r.domini, r.cells[last]?.mitjana ?? null]));
    series.push({ label: `${other.scope} · ${latest}`, values: overall.rows.map((r) => byDomain.get(r.domini) ?? null), tone: "compare" });
  } else if (prev) {
    series.push({ label: `Tots · ${prev}`, values: at(overall.rows, last - 1), tone: "compare" });
  }
  const options = [{ key: undefined as string | undefined, label: "Període anterior" }, ...perCollective.map((s) => ({ key: s.scope, label: s.scope }))];
  return { axes: overall.rows.map((r) => r.domini), series, options, active: other?.scope };
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ vs?: string }> }) {
  const { vs } = await searchParams;
  const rep = getRepresentativeness();
  const trends = getTrends();
  const themes = listThemes();
  const counts = accountCounts();
  const [overall, ...perCollective] = trends.series;

  const allVisible = counts.every((c) => c.comptes !== null);
  const totalAccounts = allVisible ? counts.reduce((a, c) => a + (c.comptes ?? 0), 0) : null;
  const visibleThemes = themes.filter((t) => !t.suprimit);
  const emergent = visibleThemes.filter((t) => t.emergent).length;
  const suppressedSegments = [...rep.collectius, ...rep.torns].filter((r) => r.suprimit).length;
  const radar = overall ? radarData(trends, vs) : null;

  return (
    <>
      <PageHeader
        title="Resultats"
        subtitle={<>Sempre en agregat. Els segments amb menys de {MIN_GROUP_SIZE} respondents es mostren com a <span className="font-medium text-muted">Suprimit</span>.</>}
        actions={
          <>
            {rep.periode && <span className="badge num">{rep.periode}</span>}
            <a href="/hr/results/export" className="btn" download>Exporta CSV</a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Comptes actius" value={totalAccounts ?? "—"} hint={allVisible ? `${counts.length} col·lectius` : `Algun col·lectiu té menys de ${MIN_GROUP_SIZE} comptes`} />
        <Stat label="Temes detectats" value={visibleThemes.length} hint="Als comentaris" />
        <Stat label="Temes emergents" value={emergent} hint="Nous aquest període" />
        <Stat label="Segments suprimits" value={suppressedSegments} hint={suppressedHint} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Perfil per domini"
          meta="Mitjana 1–5"
        >
          {radar ? (
            <div className="space-y-4">
              <nav className="segmented" aria-label="Compara amb">
                {radar.options.map((o) => (
                  <Link
                    key={o.label}
                    href={o.key ? `?vs=${encodeURIComponent(o.key)}` : "?"}
                    scroll={false}
                    aria-current={o.key === radar.active ? "true" : undefined}
                  >
                    {o.label}
                  </Link>
                ))}
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

        <Card title="Tendències per domini" meta="Mitjana 1–5 per període · tots els col·lectius" flush={!!overall}>
          {overall ? (
            <>
              <p className="border-b border-line px-5 py-3 text-xs text-subtle">
                Cada mitjana mostra la seva n i una precisió: <span className="font-medium">indicativa</span> (n &lt; {PRECISION_MODERADA_MIN_N}),{" "}
                <span className="font-medium">moderada</span> ({PRECISION_MODERADA_MIN_N}–{PRECISION_SOLIDA_MIN_N - 1}) o{" "}
                <span className="font-medium">sòlida</span> (n ≥ {PRECISION_SOLIDA_MIN_N}). Un canvi només és «puja» o «baixa» si |Δ| ≥ {CHANGE_MIN_DELTA} i els dos períodes tenen n ≥ {CHANGE_MIN_N}; si no, «sense canvi clar».
              </p>
              <TrendTable periodes={trends.periodes} rows={overall.rows} />
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
    </>
  );
}
