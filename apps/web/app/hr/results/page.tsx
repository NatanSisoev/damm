import { MIN_GROUP_SIZE } from "@damm/shared";
import {
  accountCounts,
  getRepresentativeness,
  getTrends,
  listThemes,
  type RepRow,
  type TrendCell,
} from "@damm/db/hr";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const gapLabel = (g: number) => `${g >= 0 ? "+" : "−"}${Math.abs(g * 100).toFixed(1)} pp`;

function Suppressed() {
  return <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs">Suprimit</span>;
}

function RepTable({ rows, byShift }: { rows: RepRow[]; byShift: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3">{byShift ? "Col·lectiu · torn" : "Col·lectiu"}</th>
            <th className="pr-3">Respostes</th>
            <th className="pr-3">Població</th>
            <th className="pr-3">Diferència</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-2 pr-3">{byShift ? `${r.collectiu} · ${r.torn}` : r.collectiu}</td>
              {r.suprimit ? (
                <td colSpan={3} className="py-2">
                  <Suppressed /> <span className="text-xs opacity-60">menys de {MIN_GROUP_SIZE} respondents</span>
                </td>
              ) : (
                <>
                  <td className="pr-3">
                    <Bar value={r.respShare!} color="#2563eb" />
                    <span className="text-xs">{pct(r.respShare!)} · n={r.respondents}</span>
                  </td>
                  <td className="pr-3">
                    <Bar value={r.popShare!} color="#9ca3af" />
                    <span className="text-xs">{pct(r.popShare!)}</span>
                  </td>
                  <td className={`pr-3 font-medium ${Math.abs(r.gap!) >= 0.05 ? "text-red-700" : ""}`}>{gapLabel(r.gap!)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mb-0.5 h-2 w-full max-w-40 rounded bg-black/10">
      <div className="h-2 rounded" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </div>
  );
}

function Sparkline({ cells }: { cells: TrendCell[] }) {
  const w = 80, h = 24;
  const pts = cells
    .map((c, i) => (c.mitjana === null ? null : { x: (i / Math.max(1, cells.length - 1)) * (w - 8) + 4, y: h - 4 - ((c.mitjana - 1) / 4) * (h - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label="Tendència" className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="1.5" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="#2563eb" />)}
    </svg>
  );
}

function Cell({ c }: { c: TrendCell }) {
  return <td className="pr-3">{c.suprimit ? <Suppressed /> : c.mitjana === null ? "—" : c.mitjana.toFixed(1)}</td>;
}

function TrendTable({ periodes, rows }: { periodes: string[]; rows: { domini: string; cells: TrendCell[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3">Domini</th>
            {periodes.map((p) => <th key={p} className="pr-3">{p}</th>)}
            <th>Tendència</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domini} className="border-b">
              <td className="py-1.5 pr-3">{r.domini}</td>
              {r.cells.map((c, i) => <Cell key={i} c={c} />)}
              <td><Sparkline cells={r.cells} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultsPage() {
  const rep = getRepresentativeness();
  const trends = getTrends();
  const themes = listThemes();
  const counts = accountCounts();
  const [overall, ...perCollective] = trends.series;

  return (
    <section className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Resultats</h1>
        <p className="text-sm opacity-70">
          Sempre en agregat. Els segments amb menys de {MIN_GROUP_SIZE} respondents es mostren com a &quot;Suprimit&quot;.
        </p>
      </header>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Representativitat{rep.periode ? ` · ${rep.periode}` : ""}</h2>
        <p className="text-sm opacity-70">
          Percentatge de respostes davant percentatge de la població sintètica. Les quotes es calculen només entre
          segments visibles. Diferències de 5 pp o més es marquen en vermell.
        </p>
        {rep.collectius.length === 0 ? (
          <p className="text-sm opacity-70">Encara no hi ha dades.</p>
        ) : (
          <>
            <RepTable rows={rep.collectius} byShift={false} />
            <h3 className="pt-2 font-medium">Per torn</h3>
            <RepTable rows={rep.torns} byShift />
          </>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Tendències per domini</h2>
        {overall ? (
          <>
            <p className="text-sm opacity-70">Mitjana (1–5) per període. Tots els col·lectius.</p>
            <TrendTable periodes={trends.periodes} rows={overall.rows} />
            {perCollective.map((s) => (
              <details key={s.scope} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">{s.scope}</summary>
                <div className="mt-3">
                  <TrendTable periodes={trends.periodes} rows={s.rows} />
                </div>
              </details>
            ))}
          </>
        ) : (
          <p className="text-sm opacity-70">Encara no hi ha dades.</p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Temes dels comentaris</h2>
        {themes.length === 0 ? (
          <p className="text-sm opacity-70">Encara no hi ha temes.</p>
        ) : (
          <ul className="space-y-2">
            {themes.map((t) => (
              <li key={t.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {t.suprimit ? <Suppressed /> : <span className="font-medium">{t.etiqueta}</span>}
                  {t.emergent && !t.suprimit && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-900">Emergent</span>
                  )}
                  <span className="text-xs opacity-60">{t.periode}{t.n !== null ? ` · ${t.n} comentaris` : ""}</span>
                </div>
                {t.resum && <p className="mt-1 opacity-80">{t.resum}</p>}
                {t.suprimit && <p className="mt-1 text-xs opacity-60">Menys de {MIN_GROUP_SIZE} comentaris: tema ocult.</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Comptes per col·lectiu</h2>
        <ul className="text-sm">{counts.map((c) => <li key={c.collectiu}>{c.collectiu}: {c.comptes}</li>)}</ul>
      </div>
    </section>
  );
}
