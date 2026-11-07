import { listRecommendations, listSignals } from "@damm/db/hr";
import {
  approveRecommendationAction, discardRecommendationAction, followUpAction,
} from "../actions";

const btn = "rounded border px-3 py-1 text-sm";

export default function RecommendationsPage() {
  const signals = listSignals();
  const recs = listRecommendations();
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Senyals i recomanacions</h1>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li key={s.id} className="rounded border p-3 text-sm"><b>{s.tipus}</b> · {s.descripcio} {s.collectiu ? `(${s.collectiu}) ` : ""}(n={s.n})</li>
        ))}
      </ul>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id} className="rounded border p-3 text-sm">
            <p>{r.text}</p>
            <p className="text-xs opacity-60">Estat: {r.estat}</p>
            <div className="mt-2 flex gap-2">
              {r.estat === "proposada" && (
                <>
                  <form action={approveRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className={btn}>Aprovar</button></form>
                  <form action={discardRecommendationAction}><input type="hidden" name="id" value={r.id} /><button className={btn}>Descartar</button></form>
                </>
              )}
              {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                <form action={followUpAction}><input type="hidden" name="id" value={r.id} /><button className={btn}>Crear enquesta de seguiment</button></form>
              )}
              {r.seguimentNecessitatId && <span>Seguiment creat (necessitat {r.seguimentNecessitatId})</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
