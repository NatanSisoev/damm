import { MIN_GROUP_SIZE } from "@damm/shared";

// Domain radar: fixed axis order, fixed 1-5 scale, at most 2 series.
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
const point = (i: number, n: number, v: number) => {
  const r = ((v - 1) / 4) * R;
  return { x: C + r * Math.cos(angle(i, n)), y: C + r * Math.sin(angle(i, n)) };
};

function wrapLabel(s: string): string[] {
  if (s.length <= 14) return [s];
  const words = s.split(" ");
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function Shape({ s, n }: { s: RadarSeries; n: number }) {
  const pts = s.values.map((v, i) => (v === null ? null : point(i, n, v)));
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
  const rings = [2, 3, 4, 5];
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
        aria-label={`Mitjana per domini (1 a 5): ${series.map((s) => s.label).join(" i ")}`}
      >
        {/* grid */}
        {rings.map((v) => (
          <polygon
            key={v}
            points={axes.map((_, i) => { const p = point(i, n, v); return `${p.x},${p.y}`; }).join(" ")}
            fill="none"
            className="stroke-current"
            strokeOpacity={v === 3 ? 0.45 : 0.15}
            strokeDasharray={v === 3 ? "4 4" : undefined}
          />
        ))}
        {axes.map((_, i) => {
          const p = point(i, n, 5);
          return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} className="stroke-current" strokeOpacity={0.15} />;
        })}
        {rings.map((v) => {
          const p = point(0, n, v);
          return (
            <text key={v} x={p.x + 4} y={p.y + 3} className="fill-current text-[10px]" fillOpacity={0.5}>
              {v}
            </text>
          );
        })}

        {/* comparison first so the primary series sits on top */}
        {[...series].reverse().map((s) => <Shape key={s.label} s={s} n={n} />)}

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
        Escala fixa de 1 a 5; la línia discontínua marca el 3. Un domini amb menys de {MIN_GROUP_SIZE} respostes queda en blanc, mai com a 0.
      </figcaption>
    </figure>
  );
}
