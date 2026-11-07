import Link from "next/link";
import { listRecommendations, listSignals } from "@damm/db/hr";
import {
  approveRecommendationAction, discardRecommendationAction, followUpAction,
} from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { SignalBadges } from "../signal-labels";

const ESTAT: Record<string, string> = { proposada: "", aprovada: "badge-good", descartada: "" };

export default function RecommendationsPage() {
  const signals = listSignals();
  const recs = listRecommendations();
  return (
    <>
      <PageHeader
        title="Senyals i recomanacions"
        subtitle="Senyals detectats a l'anàlisi i accions proposades per la IA. Una persona decideix quines tirar endavant."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Senyals" meta={<span className="num">{signals.length}</span>}>
          {signals.length === 0 ? (
            <Empty>Encara no hi ha senyals.</Empty>
          ) : (
            <ul className="space-y-3">
              {signals.map((s) => (
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
        <Card title="Recomanacions" meta={<span className="num">{recs.length}</span>}>
          {recs.length === 0 ? (
            <Empty>Encara no hi ha recomanacions.</Empty>
          ) : (
            <ul className="space-y-3">
              {recs.map((r) => (
                <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`badge ${ESTAT[r.estat] ?? ""}`}>{r.estat}</span>
                    {r.seguimentNecessitatId && <span className="badge badge-accent">Seguiment creat</span>}
                  </div>
                  <p>{r.text}</p>
                  {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                      {r.estat === "proposada" && (
                        <>
                          <form action={discardRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className="btn">Descartar</button></form>
                          <form action={approveRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Aprovar</button></form>
                        </>
                      )}
                      {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                        <form action={followUpAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Crear enquesta de seguiment</button></form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
