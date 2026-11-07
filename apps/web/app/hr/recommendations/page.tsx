import { recommendations, signals } from "@/lib/hr-fixtures";

export default function RecommendationsPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Senyals i recomanacions</h1>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li key={s.id} className="rounded border p-3 text-sm"><b>{s.tipus}</b> · {s.descripcio} (n={s.n})</li>
        ))}
      </ul>
      <ul className="space-y-2">
        {recommendations.map((r) => (
          <li key={r.id} className="rounded border p-3 text-sm">
            <p>{r.text}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled className="rounded border px-3 py-1">Aprovar</button>
              <button type="button" disabled className="rounded border px-3 py-1">Crear enquesta de seguiment</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
