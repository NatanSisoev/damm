import { MIN_GROUP_SIZE } from "@damm/shared";

// Domain radar: fixed axis order, at most 2 series. The scale adapts to the data
// (never narrower than 1 point, always inside 1-5) and is labelled, so small changes stay visible.
// A suppressed value (n<10) is a gap in the shape, never drawn as 0.

export type RadarSeries = { label: string; values: (number | null)[]; tone: "primary" | "compare" };

const SIZE = 420;
const C = SIZE / 2;
const R = 130;
const TONES = {
  primary: "stroke-chart-1 fill-chart-1",
  compare: "stroke-chart-2 fill-chart-2",
};
const SWATCH = { primary: "bg-chart-1", compare: "bg-chart-2" };

const angle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
const fmt = (v: number) => v.toLocaleString("ca", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Scale = { lo: number; hi: number; rings: number[]; full: boolean };

/** Range from the visible values with ~0.25 padding, rounded to 0.5, at least 1 point wide, clamped to 1-5. */
function scaleFor(series: RadarSeries[]): Scale {
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (vals.length === 0) return { lo: 1, hi: 5, rings: [2, 3, 4, 5], full: true };
  let lo = Math.max(1, Math.floor((Math.min(...vals) - 0.25) * 2) / 2);
  let hi = Math.min(5, Math.ceil((Math.max(...vals) + 0.25) * 2) / 2);
  if (hi - lo < 1) {
    if (hi < 5) hi = Math.min(5, lo + 1);
    if (hi - lo < 1) lo = hi - 1;
  }
  const step = hi - lo <= 2 ? 0.5 : 1;
  const rings: number[] = [];
  for (let v = lo + step; v <= hi + 1e-9; v += step) rings.push(Math.round(v * 2) / 2);
  return { lo, hi, rings, full: lo === 1 && hi === 5 };
}

const point = (i: number, n: number, v: number, sc: Scale) => {
  const r = ((v - sc.lo) / (sc.hi - sc.lo)) * R;
  return { x: C + r * Math.cos(angle(i, n)), y: C + r * Math.sin(angle(i, n)) };
};

function wrapLabel(s: string): string[] {
  if (s.length <= 14) return [s];
  const words = s.split(" ");
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function Shape({ s, n, sc }: { s: RadarSeries; n: number; sc: Scale }) {
  const pts = s.values.map((v, i) => (v === null ? null : point(i, n, v, sc)));
  const complete = pts.every((p) => p !== null);
  const tone = TONES[s.tone];
  // Edges only between neighbouring axes that both have a value.
  const edges = pts.flatMap((p, i) => {
    const q = pts[(i + 1) % n];
    return p && q ? [{ p, q, key: i }] : [];
  });
  return (
    <g>
      {complete && (
        <polygon
          points={pts.map((p) => `${p!.x},${p!.y}`).join(" ")}
          className={`${tone} stroke-0`}
          fillOpacity={0.12}
        />
      )}
      {edges.map(({ p, q, key }) => (
        <line
          key={key}
          x1={p.x} y1={p.y} x2={q.x} y2={q.y}
          className={tone}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={s.tone === "compare" ? "5 4" : undefined}
        />
      ))}
      {pts.map((p, i) =>
        p ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4.5} className={`${tone} stroke-surface`} strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={12} fill="transparent">
              <title>{`${s.label}: ${s.values[i]!.toFixed(1)}`}</title>
            </circle>
          </g>
        ) : null,
      )}
    </g>
  );
}

export function Radar({ axes, series }: { axes: string[]; series: RadarSeries[] }) {
  const n = axes.length;
  const sc = scaleFor(series);
  const rings = sc.rings;
  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap gap-4 text-[13px] text-muted">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span
              className={`inline-block h-0.5 w-5 ${SWATCH[s.tone]}`}
              style={s.tone === "compare" ? { maskImage: "repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 9px)" } : undefined}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`-80 25 ${SIZE + 160} ${SIZE - 30}`}
        className="mx-auto w-full max-w-[34rem] text-muted"
        role="img"
        aria-label={`Mitjana per domini (escala de ${fmt(sc.lo)} a ${fmt(sc.hi)}): ${series.map((s) => s.label).join(" i ")}`}
      >
        {/* grid */}
        {rings.map((v) => (
          <polygon
            key={v}
            points={axes.map((_, i) => { const p = point(i, n, v, sc); return `${p.x},${p.y}`; }).join(" ")}
            fill="none"
            className="stroke-current"
            strokeOpacity={v === 3 ? 0.45 : 0.15}
            strokeDasharray={v === 3 ? "4 4" : undefined}
          />
        ))}
        {axes.map((_, i) => {
          const p = point(i, n, sc.hi, sc);
          return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} className="stroke-current" strokeOpacity={0.15} />;
        })}
        {rings.map((v) => {
          const p = point(0, n, v, sc);
          return (
            <text key={v} x={p.x + 4} y={p.y + 3} className="fill-current text-[10px]" fillOpacity={0.5}>
              {fmt(v)}
            </text>
          );
        })}

        {/* comparison first so the primary series sits on top */}
        {[...series].reverse().map((s) => <Shape key={s.label} s={s} n={n} sc={sc} />)}

        {/* axis labels, with an n<10 note per suppressed series */}
        {axes.map((a, i) => {
          const ang = angle(i, n);
          const x = C + (R + 22) * Math.cos(ang);
          const y = C + (R + 22) * Math.sin(ang);
          const anchor = Math.abs(Math.cos(ang)) < 0.2 ? "middle" : Math.cos(ang) > 0 ? "start" : "end";
          const lines = wrapLabel(a);
          const suppressed = series.filter((s) => s.values[i] === null);
          const yStart = Math.sin(ang) < -0.5 ? y - (lines.length - 1 + suppressed.length) * 13 : y;
          return (
            <text key={a} x={x} y={yStart} textAnchor={anchor} className="fill-current text-[12px]">
              {lines.map((l, j) => (
                <tspan key={j} x={x} dy={j === 0 ? 4 : 13}>{l}</tspan>
              ))}
              {suppressed.map((s) => (
                <tspan key={s.label} x={x} dy={13} className="text-[10px]" fillOpacity={0.6}>
                  {series.length > 1 ? `${s.label.split(" · ")[0]}: n<${MIN_GROUP_SIZE}` : `n<${MIN_GROUP_SIZE}`}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-xs text-subtle">
        {sc.full
          ? "Escala de 1 a 5"
          : `Escala ampliada de ${fmt(sc.lo)} a ${fmt(sc.hi)} (escala completa: 1 a 5); el centre no és 0`}
        {sc.rings.includes(3) && sc.lo < 3 ? "; la línia discontínua marca el 3" : ""}. Passa el cursor per un punt per veure el valor exacte. Un domini amb menys de {MIN_GROUP_SIZE} respostes queda en blanc, mai com a 0.
      </figcaption>
    </figure>
  );
}
