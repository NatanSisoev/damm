"use client";

// Sparkline of answers per day for the Panell tile: thin 2px line, one recessive baseline, tooltip on hover or focus.
// Points are already aggregated and thin days are dropped upstream; the tooltip text arrives pre-translated.
import { useState } from "react";

const W = 160;
const H = 36;
const PAD = 4;

export function AnswersSpark({ points, aria }: { points: { tip: string; value: number }[]; aria: string }) {
  const [i, setI] = useState<number | null>(null);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const xy = points.map((p, k) => ({ x: PAD + (k / (points.length - 1)) * (W - 2 * PAD), y: H - PAD - ((p.value - min) / span) * (H - 2 * PAD) }));
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setI(Math.max(0, Math.min(points.length - 1, Math.round(((x - PAD) / (W - 2 * PAD)) * (points.length - 1)))));
  };
  const cur = i === null ? null : xy[i];
  return (
    <div className="relative mt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-9 w-full max-w-[200px] touch-none"
        role="img"
        aria-label={aria}
        tabIndex={0}
        onPointerMove={move}
        onPointerLeave={() => setI(null)}
        onBlur={() => setI(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setI((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          else if (e.key === "ArrowLeft") setI((v) => Math.max(0, (v ?? points.length) - 1));
          else if (e.key === "Escape") setI(null);
        }}
      >
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-line" strokeWidth="1" />
        <polyline points={xy.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {cur && <circle cx={cur.x} cy={cur.y} r="3" className="fill-chart-1" />}
      </svg>
      <div aria-live="polite" className="num mt-1 h-4 text-xs text-subtle">{i === null ? "" : points[i].tip}</div>
    </div>
  );
}
