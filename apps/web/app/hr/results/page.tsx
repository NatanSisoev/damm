import { MIN_GROUP_SIZE } from "@damm/shared";
import { aggregates } from "@/lib/hr-fixtures";

export default function ResultsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Resultats</h1>
      <p className="text-sm opacity-70">Mínim {MIN_GROUP_SIZE} respondents per segment.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th>Període</th><th>Col·lectiu</th><th>Torn</th><th>n</th><th>Mitjana</th></tr></thead>
        <tbody>
          {aggregates.map((a, i) => (
            <tr key={i} className="border-b">
              <td>{a.periode}</td><td>{a.collectiuId}</td><td>{a.tornId}</td><td>{a.n}</td>
              <td>{a.suprimit ? `Suprimit (n < ${MIN_GROUP_SIZE})` : a.mitjana?.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
