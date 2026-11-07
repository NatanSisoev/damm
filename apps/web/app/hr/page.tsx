import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getHrOverview } from "@damm/db/hr";
import { Card, Empty, PageHeader, Stat } from "./ui";
import { getHeadlines, getNarrative, getProposals, getReachGaps } from "./analytics";
import { HeadlineStrip, NarrativeCard, ProposalsCard, ReachCard } from "./analytics-ui";

export default function HrHome() {
  const o = getHrOverview();
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("ca-ES"));
  const drafts = o.pending.filter((i) => i.kind === "draft");

  return (
    <>
      <PageHeader
        title="Inici"
        subtitle="Què ha canviat, per què i què cal fer ara."
        actions={o.periode ? <span className="badge num">{o.periode}</span> : undefined}
      />

      <div className="space-y-6">
        <HeadlineStrip headlines={getHeadlines()} />
        <NarrativeCard narrative={getNarrative("All")} title="Resum de l'anàlisi · tota l'empresa" />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Participació"
            value={o.participation === null ? "—" : `${Math.round(o.participation * 100)}%`}
            hint={
              o.coveredPopulation === null
                ? `de ${o.population.toLocaleString("ca-ES")} persones`
                : `de ${o.coveredPopulation.toLocaleString("ca-ES")} persones${o.excludedCollectius > 0 ? ` (${o.excludedCollectius} col·lectiu ocult per n<${MIN_GROUP_SIZE})` : ""}`
            }
          />
          <Stat label="Han respost" value={fmt(o.respondents)} hint={o.periode ?? "Sense període"} />
          <Stat label="Necessitats obertes" value={o.openNeeds} hint="sense publicar" />
          <Stat label="Senyals" value={o.signalCount} hint={`n ≥ ${MIN_GROUP_SIZE}`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ProposalsCard proposals={getProposals()} />
          <Card
            title="Esborranys per aprovar"
            meta={<Link href="/hr/needs?estat=esborrany" className="text-accent-ink hover:underline">Obrir →</Link>}
          >
            {drafts.length === 0 ? (
              <Empty>Cap esborrany pendent.</Empty>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {drafts.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <Link href="/hr/needs?estat=esborrany" className="flex items-start gap-3 py-3 hover:text-accent-ink">
                      <span className="badge mt-0.5">Esborrany</span>
                      <span className="text-[13px]">{i.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <ReachCard gaps={getReachGaps(3)} />

        <p className="text-sm">
          <Link href="/hr/results" className="text-accent-ink hover:underline">
            Mapa de calor, temes i dades detallades →
          </Link>
        </p>
      </div>
    </>
  );
}
