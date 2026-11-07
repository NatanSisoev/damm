import Link from "next/link";
import { listRecommendations, listSignals } from "@damm/db/hr";
import {
  approveRecommendationAction, discardRecommendationAction, followUpAction,
} from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { SignalBadges, SignalText } from "../signal-labels";
import { compareSignals } from "@/lib/signal-text";
import { recommendationStatus } from "../labels";


export default function RecommendationsPage() {
  const signals = listSignals().sort(compareSignals);
  const recs = listRecommendations();
  return (
    <>
      <PageHeader
        title="Recomanacions"
        subtitle="Alarmes detectades per l'anàlisi i accions proposades per la IA. Una persona decideix quines tirar endavant."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="Alarmes" meta={<span className="num">{signals.length}</span>}>
          {signals.length === 0 ? (
            <Empty>Encara no hi ha alarmes. <Link href="/hr/results" className="underline">Mira els resultats</Link> o torna més tard.</Empty>
          ) : (
            <ul className="space-y-3">
              {signals.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-3">
                  <SignalText s={s} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SignalBadges tipus={s.tipus} severity={s.severity} status={s.status} />
                    <span className="num ml-auto text-xs text-subtle">{s.periode} · n={s.n}</span>
                  </div>
                  <Link href={`/hr/signals/${s.id}`} className="mt-2 inline-block text-xs text-accent-ink hover:underline">Veure detall →</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recomanacions" meta={<span className="num">{recs.length}</span>}>
          {recs.length === 0 ? (
            <Empty>Encara no hi ha recomanacions. Obre una alarma i demana-ne una, o <Link href="/hr/needs" className="underline">crea una necessitat</Link>.</Empty>
          ) : (
            <ul className="space-y-3">
              {recs.map((r) => (
                <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`badge ${recommendationStatus(r.estat).cls}`}>{recommendationStatus(r.estat).label}</span>
                    {r.seguimentNecessitatId && <span className="badge badge-accent">Seguiment creat</span>}
                  </div>
                  <p>{r.text}</p>
                  {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                      {r.estat === "proposada" && (
                        <>
                          <form action={discardRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className="btn">Descarta</button></form>
                          <form action={approveRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Aprova</button></form>
                        </>
                      )}
                      {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                        <form action={followUpAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Crea l&apos;enquesta de seguiment</button></form>
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
