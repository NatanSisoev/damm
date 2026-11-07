import { MIN_GROUP_SIZE } from "@damm/shared";
import { accountCounts, listAggregates } from "@damm/db/hr";

export default function ResultsPage() {
  const rows = listAggregates();
  const counts = accountCounts();
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Resultats</h1>
      <p className="text-sm opacity-70">Mínim {MIN_GROUP_SIZE} respondents per segment.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th>Període</th><th>Col·lectiu</th><th>Torn</th><th>Domini</th><th>n</th><th>Mitjana</th></tr></thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i} className="border-b">
              <td>{a.periode}</td><td>{a.collectiu ?? "Tots"}</td><td>{a.torn ?? "Tots"}</td><td>{a.domini ?? "Tots"}</td>
              <td>{a.suprimit ? "<" + MIN_GROUP_SIZE : a.n}</td>
              <td>{a.suprimit ? "Suprimit" : a.mitjana?.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h2 className="font-semibold">Comptes per col·lectiu</h2>
        <ul className="text-sm">{counts.map((c) => <li key={c.collectiu}>{c.collectiu}: {c.comptes}</li>)}</ul>
      </div>
    </section>
  );
}
