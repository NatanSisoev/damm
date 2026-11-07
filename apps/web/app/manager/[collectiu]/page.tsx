import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import {
  getRepresentativeness,
  getTrends,
  listCollectius,
  listManagerRecommendations,
  listManagerSignals,
  listThemes,
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
} from "@damm/db/hr";
import { Radar, type RadarSeries } from "../../hr/results/radar";
import { RepTable, TrendTable } from "../../hr/results/tables";
import { Card, Empty, PageHeader, SuppressedBadge } from "../../hr/ui";
import { SignalBadges } from "../../hr/signal-labels";
import { AggregateNote } from "../note";

export default async function ManagerCollectivePage({ params }: { params: Promise<{ collectiu: string }> }) {
  const { collectiu: raw } = await params;
  const nom = decodeURIComponent(raw);
  const all = listCollectius();
  const collectiu = all.find((c) => c.nom === nom);
  if (!collectiu) notFound();

  const trends = getTrends();
  const series = trends.series.find((s) => s.scope === collectiu.nom);
  const rep = getRepresentativeness();
  const repRows = rep.collectius.filter((r) => r.collectiu === collectiu.nom);
  const shiftRows = rep.torns.filter((r) => r.collectiu === collectiu.nom);
  const themes = listThemes().filter((t) => !t.suprimit);
  const signals = listManagerSignals(collectiu.id);
  const recs = listManagerRecommendations(collectiu.id);

  const last = trends.periodes.length - 1;
  const latest = trends.periodes[last];
  const prev = trends.periodes[last - 1];
  const radarSeries: RadarSeries[] = series
    ? [
        { label: `${collectiu.nom} · ${latest}`, values: series.rows.map((r) => r.cells[last]?.mitjana ?? null), tone: "primary" },
        ...(prev ? [{ label: `${collectiu.nom} · ${prev}`, values: series.rows.map((r) => r.cells[last - 1]?.mitjana ?? null), tone: "compare" as const }] : []),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={collectiu.nom}
        subtitle="Resultats del col·lectiu: perfil per domini, tendència, temes i recomanacions aprovades."
        actions={
          <>
            {rep.periode && <span className="badge num">{rep.periode}</span>}
            <Link href="/manager" className="btn">Canvia de col·lectiu</Link>
          </>
        }
      />
      <AggregateNote />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Perfil per domini" meta="Mitjana 1–5">
          {series ? <Radar axes={series.rows.map((r) => r.domini)} series={radarSeries} /> : <Empty>Encara no hi ha dades visibles per a aquest col·lectiu.</Empty>}
        </Card>

        <Card title="Recomanacions aprovades" meta={<span className="num">{recs.length}</span>}>
          {recs.length === 0 ? (
            <Empty>Encara no hi ha recomanacions aprovades per a aquest col·lectiu.</Empty>
          ) : (
            <ul className="space-y-3">
              {recs.map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-4">
                  {r.seguiment && <span className="badge badge-accent mb-2">Enquesta de seguiment en marxa</span>}
                  <p>{r.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card title="Tendència per domini" meta="Mitjana 1–5 per període" flush={!!series}>
          {series ? (
            <>
              <p className="border-b border-line px-5 py-3 text-xs text-subtle">
                Cada mitjana mostra la seva n i una precisió: <span className="font-medium">indicativa</span> (n &lt; {PRECISION_MODERADA_MIN_N}),{" "}
                <span className="font-medium">moderada</span> ({PRECISION_MODERADA_MIN_N}–{PRECISION_SOLIDA_MIN_N - 1}) o{" "}
                <span className="font-medium">sòlida</span> (n ≥ {PRECISION_SOLIDA_MIN_N}). Un canvi només és «puja» o «baixa» si |Δ| ≥ {CHANGE_MIN_DELTA} i els dos períodes tenen n ≥ {CHANGE_MIN_N}.
              </p>
              <TrendTable periodes={trends.periodes} rows={series.rows} />
            </>
          ) : (
            <Empty>Encara no hi ha dades visibles per a aquest col·lectiu.</Empty>
          )}
        </Card>

        <Card
          title="Representativitat"
          meta={<>Respostes davant població sintètica · <Link href="/hr/methodology" className="underline">Com es calcula?</Link></>}
          flush={repRows.length > 0}
        >
          {repRows.length === 0 ? (
            <Empty>Encara no hi ha dades.</Empty>
          ) : (
            <>
              <RepTable rows={repRows} byShift={false} />
              {shiftRows.length > 0 && (
                <>
                  <div className="border-t border-line px-5 pt-5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Per torn</div>
                  <RepTable rows={shiftRows} byShift />
                </>
              )}
            </>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Temes dels comentaris" meta="Tota l'empresa, no només aquest col·lectiu">
            {themes.length === 0 ? (
              <Empty>Encara no hi ha temes.</Empty>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {themes.map((t) => (
                  <li key={t.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.etiqueta}</span>
                      {t.emergent && <span className="badge badge-accent">Emergent</span>}
                      <span className="num ml-auto text-xs text-subtle">{t.periode}</span>
                    </div>
                    {t.resum && <p className="mt-1 text-[13px] text-muted">{t.resum}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-subtle">Els temes s&apos;extreuen de tots els comentaris. Els que tenen menys de {MIN_GROUP_SIZE} comentaris no es mostren.</p>
          </Card>

          <Card title="Senyals del col·lectiu" meta={<span className="num">{signals.length}</span>}>
            {signals.length === 0 ? (
              <Empty>Cap senyal per a aquest col·lectiu.</Empty>
            ) : (
              <ul className="space-y-3">
                {signals.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <SignalBadges tipus={s.tipus} severity={s.severity} />
                      <span className="num ml-auto text-xs text-subtle">n={s.n}</span>
                    </div>
                    <p className="text-[13px]">{s.descripcio}</p>
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

function SuppressedNote() {
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-subtle">
      <SuppressedBadge /> Els grups de menys de {MIN_GROUP_SIZE} persones no es mostren mai.
    </p>
  );
}
