"use client";

// Multi-line chart of the domain means per period (plain SVG, one y axis). Domains with a clear change
// are coloured, the rest are muted grey. Suppressed (n < min group size) points are never drawn: gap in the line.
import { useEffect, useRef, useState } from "react";
import type { TrendRow } from "@damm/db/hr";

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const H = 300;
const PAD = { top: 14, bottom: 30, left: 34 };

type Pt = { x: number; y: number; v: number; n: number | null; precisio: string | null; pi: number };

// `highlight`: domain names to emphasise (coloured, thicker); all others muted. Without it, domains with a clear change are coloured.
export function TrendChart({ periodes, rows, highlight }: { periodes: string[]; rows: TrendRow[]; highlight?: string[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [active, setActive] = useState<{ ri: number; pi: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const values = rows.flatMap((r) => r.cells.map((c) => (c.suprimit ? null : c.mitjana))).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  // Zoomed axis from the data: round down/up to 0.5, at least 1 point of range, inside 1-5.
  let lo = Math.floor(Math.min(...values) * 2) / 2;
  let hi = Math.ceil(Math.max(...values) * 2) / 2;
  if (hi - lo < 1) hi = lo + 1;
  if (hi > 5) { hi = 5; lo = Math.min(lo, 4); }
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t);

  const narrow = w < 520;
  const right = narrow ? 112 : 190;
  const plotL = PAD.left, plotR = w - right;
  const yOf = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const xOf = (i: number) => (periodes.length < 2 ? (plotL + plotR) / 2 : plotL + 12 + (i / (periodes.length - 1)) * (plotR - plotL - 24));
  const maxChars = Math.floor((right - 10) / 6.2);
  const clip = (s: string, extra: number) => (s.length + extra > maxChars ? s.slice(0, Math.max(4, maxChars - extra - 1)).trimEnd() + "…" : s);

  const series = rows.map((r, ri) => {
    const pts: (Pt | null)[] = r.cells.map((c, pi) =>
      c.suprimit || c.mitjana === null ? null : { x: xOf(pi), y: yOf(c.mitjana), v: c.mitjana, n: c.n, precisio: c.precisio, pi },
    );
    return { r, ri, pts, changed: highlight ? highlight.includes(r.domini) : r.canvi.label !== "sense canvi clar" };
  });

  // Direct labels at the line end (last drawn point), nudged apart vertically.
  const labelGap = 14;
  const labels = series
    .map((s) => {
      const last = [...s.pts].reverse().find((p): p is Pt => p !== null);
      return last ? { ri: s.ri, y: last.y, ly: last.y, last } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.y - b.y);
  const top = PAD.top + 4, bottom = H - PAD.bottom;
  labels.forEach((l, i) => { l.ly = Math.max(i === 0 ? top : labels[i - 1].ly + labelGap, l.y); });
  for (let i = labels.length - 1; i >= 0; i--) {
    const max = i === labels.length - 1 ? bottom : labels[i + 1].ly - labelGap;
    if (labels[i].ly > max) labels[i].ly = max;
  }
  const labelY = new Map(labels.map((l) => [l.ri, l.ly]));

  // Draw muted first so coloured lines sit on top.
  const ordered = [...series].sort((a, b) => Number(a.changed) - Number(b.changed));
  const act = active ? series[active.ri] : null;
  const actPt = act && active ? act.pts[active.pi] : null;
  const actCell = act && active ? act.r.cells[active.pi] : null;

  const segments = (pts: (Pt | null)[]) => {
    const out: Pt[][] = [];
    let cur: Pt[] = [];
    for (const p of pts) {
      if (p) cur.push(p);
      else if (cur.length) { out.push(cur); cur = []; }
    }
    if (cur.length) out.push(cur);
    return out;
  };

  const hasChange = series.some((s) => s.changed);

  return (
    <div className="px-5 py-4">
      <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setActive(null)}>
        <svg width={w} height={H} role="img" aria-label="Mitjana per domini i període. Els dominis amb canvi clar van en color, la resta en gris." className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={plotL} x2={plotR} y1={yOf(t)} y2={yOf(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={plotL - 8} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)" className="num">{f1(t)}</text>
            </g>
          ))}
          {periodes.map((p, i) => (
            <text key={p} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-subtle)" className="num">{p}</text>
          ))}
          {ordered.map((s) => {
            const color = s.changed ? `var(--dom-${(s.ri % 6) + 1})` : "var(--dom-muted)";
            const dim = active && active.ri !== s.ri ? 0.35 : 1;
            return (
              <g key={s.r.domini} opacity={dim}>
                {segments(s.pts).map((seg, k) =>
                  seg.length > 1 ? (
                    <polyline key={k} points={seg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={s.changed && highlight ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                  ) : null,
                )}
                {s.pts.map((p, pi) =>
                  p ? <circle key={pi} cx={p.x} cy={p.y} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" /> : null,
                )}
              </g>
            );
          })}
          {labels.map((l) => {
            const s = series[l.ri];
            const ly = labelY.get(l.ri)!;
            const val = f1(l.last.v);
            return (
              <g key={s.r.domini} opacity={active && active.ri !== s.ri ? 0.5 : 1}>
                {Math.abs(ly - l.y) > 2 && <line x1={l.last.x + 6} y1={l.y} x2={plotR + 8} y2={ly - 4} stroke="var(--border-strong)" strokeWidth="1" />}
                <text x={plotR + 12} y={ly} fontSize="11.5" fill={s.changed ? "var(--text)" : "var(--text-subtle)"} fontWeight={s.changed ? 700 : 400}>
                  {clip(s.r.domini, val.length + 1)} <tspan className="num">{val}</tspan>
                </text>
              </g>
            );
          })}
          {/* Hit targets bigger than the marks */}
          {series.map((s) =>
            s.pts.map((p, pi) =>
              p ? (
                <circle
                  key={`${s.ri}-${pi}`}
                  cx={p.x}
                  cy={p.y}
                  r="14"
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${s.r.domini}, ${periodes[pi]}: ${f1(p.v)}, n=${p.n}, ${p.precisio}`}
                  onMouseEnter={() => setActive({ ri: s.ri, pi })}
                  onFocus={() => setActive({ ri: s.ri, pi })}
                  onBlur={() => setActive(null)}
                  onPointerDown={() => setActive({ ri: s.ri, pi })}
                  style={{ outline: "none" }}
                />
              ) : null,
            ),
          )}
        </svg>
        {act && actPt && actCell && active && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 border border-line bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(actPt.x + 12, 0), w - 190), top: Math.max(0, actPt.y - 64), width: 180 }}
          >
            <div className="font-semibold">{act.r.domini}</div>
            <div className="num text-subtle">{periodes[active.pi]}</div>
            <div className="num mt-1">Mitjana {f1(actPt.v)} / 5</div>
            <div className="num text-subtle">n = {actCell.n} · {actCell.precisio}</div>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" aria-label="Llegenda">
        {series.map((s) => (
          <li key={s.r.domini} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: s.changed ? `var(--dom-${(s.ri % 6) + 1})` : "var(--dom-muted)" }} />
            <span className={s.changed ? "font-semibold" : "text-subtle"}>
              {s.r.domini}
              {s.changed && s.r.canvi.delta !== null && s.r.canvi.label !== "sense canvi clar" && <span className="num"> · {s.r.canvi.label === "puja" ? "↑" : "↓"} {s.r.canvi.delta! >= 0 ? "+" : "−"}{f1(Math.abs(s.r.canvi.delta!))}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-subtle">
        {highlight
          ? "En color: domini relacionat amb el senyal. En gris: la resta de dominis."
          : hasChange ? "En color: dominis amb canvi clar entre períodes. En gris: sense canvi clar." : "Cap domini té un canvi clar: tots en gris."}{" "}
        Els períodes suprimits (menys de 10 respondents) no es dibuixen.
      </p>
    </div>
  );
}
