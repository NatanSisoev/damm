import { CHANGE_MIN_DELTA, CHANGE_MIN_N, type Change } from "@damm/db/hr";
import { num1 } from "@/lib/format";

/** Mean on the 1–5 scale. Each sparkline is drawn on the 1–5 scale so small moves stay small. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 80, h = 24;
  const pts = values
    .map((v, i) => (v === null ? null : { x: (i / Math.max(1, values.length - 1)) * (w - 8) + 4, y: h - 4 - ((v - 1) / 4) * (h - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label="Tendència (escala 1 a 5)" className="inline-block">
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
        title={`Només es parla de canvi si |Δ| ≥ ${num1(CHANGE_MIN_DELTA)} i els dos períodes tenen n ≥ ${CHANGE_MIN_N}`}
      >
        sense canvi clar
      </span>
    );
  }
  const up = canvi.label === "puja";
  return (
    <span className="badge num" title={`Δ ${canvi.delta! >= 0 ? "+" : "−"}${num1(Math.abs(canvi.delta!))}`}>
      {up ? "↑ puja" : "↓ baixa"} {canvi.delta! >= 0 ? "+" : "−"}{num1(Math.abs(canvi.delta!))}
    </span>
  );
}
