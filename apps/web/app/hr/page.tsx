import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getHrOverview, getTrends } from "@damm/db/hr";
import { Radar, type RadarSeries } from "./results/radar";
import { Card, Empty, PageHeader, Stat } from "./ui";

import { SignalBadges } from "./signal-labels";

function radarFromTrends() {
  const { periodes, series: all } = getTrends();
  const overall = all[0];
  if (!overall || !overall.rows.length) return null;
  const last = periodes.length - 1;
  const at = (k: number) => overall.rows.map((r) => r.cells[k]?.mitjana ?? null);
  const series: RadarSeries[] = [{ label: `Tots · ${periodes[last]}`, values: at(last), tone: "primary" }];
  if (last > 0) series.push({ label: `Tots · ${periodes[last - 1]}`, values: at(last - 1), tone: "compare" });
  return { axes: overall.rows.map((r) => r.domini), series };
}

export default function HrHome() {
  const o = getHrOverview();
  const radar = radarFromTrends();
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("ca-ES"));
  const decisions = o.pendingDrafts + o.pendingRecommendations;

  return (
    <>
      <PageHeader
        title="Inici"
        subtitle="Resum de l'escolta activa: com va la participació, què diuen els senyals i què espera una decisió teva."
        actions={o.periode ? <span className="badge num">{o.periode}</span> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Participació"
          value={o.participation === null ? "—" : `${Math.round(o.participation * 100)}%`}
          hint={
            o.coveredPopulation === null
              ? `de ${o.population.toLocaleString("ca-ES")} persones`
              : `de ${o.coveredPopulation.toLocaleString("ca-ES")} persones${o.excludedCollectius > 0 ? ` (${o.excludedCollectius} col·lectiu ocult per n<${MIN_GROUP_SIZE})` : ""}`
          }
        />
        <Stat label="Respondents" value={fmt(o.respondents)} hint={o.periode ?? "Sense període"} />
        <Stat label="Necessitats obertes" value={o.openNeeds} hint="sense publicar" />
        <Stat label="Esborranys" value={o.pendingDrafts} hint="pendents d'aprovar" />
        <Stat label="Senyals" value={o.signalCount} hint={`n ≥ ${MIN_GROUP_SIZE}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Mitjana per domini"
          meta={<Link href="/hr/results" className="text-accent-ink hover:underline">Veure resultats →</Link>}
        >
          {radar ? <Radar axes={radar.axes} series={radar.series} /> : <Empty>Encara no hi ha dades.</Empty>}
        </Card>

        <div className="space-y-6">
          <Card
            title="Pendent de decisió"
            meta={<span className="num">{decisions}</span>}
          >
            {o.pending.length === 0 ? (
              <Empty>Res pendent: tot decidit.</Empty>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {o.pending.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <Link
                      href={i.kind === "draft" ? "/hr/review" : "/hr/recommendations"}
                      className="flex items-start gap-3 py-3 hover:text-accent-ink"
                    >
                      <span className={`badge mt-0.5 ${i.kind === "draft" ? "" : "badge-accent"}`}>
                        {i.kind === "draft" ? "Esborrany" : "Recomanació"}
                      </span>
                      <span className="text-[13px]">{i.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Senyals principals"
            meta={<Link href="/hr/recommendations" className="text-accent-ink hover:underline">Tots →</Link>}
          >
            {o.topSignals.length === 0 ? (
              <Empty>Encara no hi ha senyals.</Empty>
            ) : (
              <ul className="space-y-3">
                {o.topSignals.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <SignalBadges tipus={s.tipus} severity={s.severity} status={s.status} />
                      {s.collectiu && <span className="badge">{s.collectiu}</span>}
                      <span className="num ml-auto text-xs text-subtle">n={s.n}</span>
                    </div>
                    <p className="text-[13px]">{s.descripcio}</p>
                    <Link href={`/hr/signals/${s.id}`} className="mt-2 inline-block text-xs text-accent-ink hover:underline">Veure detall →</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
