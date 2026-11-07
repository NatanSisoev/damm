import { MIN_GROUP_SIZE } from "@damm/shared";
import { SuppressedBadge } from "../ui";
import {
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  REP_GAP_FLAG,
  type Change,
  type RepRow,
  type TrendCell,
  type TrendRow,
} from "@damm/db/hr";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const gapLabel = (g: number) => `${g >= 0 ? "+" : "−"}${Math.abs(g * 100).toFixed(1)} pp`;
export const suppressedHint = `Menys de ${MIN_GROUP_SIZE} respondents`;
const complementaryHint = "Ocult per protegir un grup petit: no es pot deduir per resta";
const hintFor = (motiu: "primari" | "complementari" | null) => (motiu === "complementari" ? complementaryHint : suppressedHint);


export function Bar({ value, tone }: { value: number; tone: "chart" | "muted" }) {
  return (
    <div className="h-1.5 w-full max-w-36 rounded-full bg-surface-muted">
      <div
        className={`h-1.5 rounded-full ${tone === "chart" ? "bg-chart-1" : "bg-line-strong"}`}
        style={{ width: `${Math.min(100, value * 100)}%` }}
      />
    </div>
  );
}

export function RepTable({ rows, byShift }: { rows: RepRow[]; byShift: boolean }) {
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>{byShift ? "Col·lectiu · torn" : "Col·lectiu"}</th>
          <th>Respostes</th>
          <th>Població</th>
          <th className="text-right">Diferència</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="font-medium">{byShift ? `${r.collectiu} · ${r.torn}` : r.collectiu}</td>
            {r.suprimit ? (
              <td colSpan={3}>
                <span className="flex items-center gap-2">
                  <SuppressedBadge title={hintFor(r.motiu)} />
                  <span className="text-xs text-subtle">{hintFor(r.motiu)}</span>
                </span>
              </td>
            ) : (
              <>
                <td>
                  <div className="flex items-center gap-3">
                    <Bar value={r.respShare!} tone="chart" />
                    <span className="num text-xs whitespace-nowrap text-muted">{pct(r.respShare!)} · n={r.respondents}</span>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <Bar value={r.popShare!} tone="muted" />
                    <span className="num text-xs text-muted">{pct(r.popShare!)}</span>
                  </div>
                </td>
                <td className="text-right">
                  {Math.abs(r.gap!) >= REP_GAP_FLAG ? (
                    <span className="badge badge-warn num">{gapLabel(r.gap!)}</span>
                  ) : (
                    <span className="num text-muted">{gapLabel(r.gap!)}</span>
                  )}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Sparkline({ cells }: { cells: TrendCell[] }) {
  const w = 80, h = 24;
  const pts = cells
    .map((c, i) => (c.mitjana === null ? null : { x: (i / Math.max(1, cells.length - 1)) * (w - 8) + 4, y: h - 4 - ((c.mitjana - 1) / 4) * (h - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label="Tendència" className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-chart-1" />)}
    </svg>
  );
}

export function ChangeBadge({ canvi }: { canvi: Change }) {
  if (canvi.label === "sense canvi clar") {
    return (
      <span
        className="text-xs text-subtle"
        title={`Només es parla de canvi si |Δ| ≥ ${CHANGE_MIN_DELTA} i els dos períodes tenen n ≥ ${CHANGE_MIN_N}`}
      >
        sense canvi clar
      </span>
    );
  }
  const up = canvi.label === "puja";
  return (
    <span className="badge num" title={`Δ ${canvi.delta! >= 0 ? "+" : "−"}${Math.abs(canvi.delta!).toFixed(1)}`}>
      {up ? "↑ puja" : "↓ baixa"} {canvi.delta! >= 0 ? "+" : "−"}{Math.abs(canvi.delta!).toFixed(1)}
    </span>
  );
}

export function TrendTable({ periodes, rows }: { periodes: string[]; rows: TrendRow[] }) {
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>Domini</th>
          {periodes.map((p) => <th key={p} className="text-right">{p}</th>)}
          <th className="text-right">Tendència</th>
          <th className="text-right">Canvi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domini}>
            <td className="font-medium">{r.domini}</td>
            {r.cells.map((c, i) => (
              <td key={i} className="num text-right">
                {c.suprimit ? (
                  <SuppressedBadge title={hintFor(c.motiu)} />
                ) : c.mitjana === null ? (
                  <span className="text-subtle">–</span>
                ) : (
                  <div>
                    <div>{c.mitjana.toFixed(1)}</div>
                    <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}>
                      n={c.n} · {c.precisio}
                    </div>
                  </div>
                )}
              </td>
            ))}
            <td className="text-right"><Sparkline cells={r.cells} /></td>
            <td className="text-right"><ChangeBadge canvi={r.canvi} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

