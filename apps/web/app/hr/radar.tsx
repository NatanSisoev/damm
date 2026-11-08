import { MIN_GROUP_SIZE } from "@damm/shared";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";

// Domain radar: fixed axis order, up to 4 series (the shown selection plus up to 3 comparisons). The scale adapts to the data
// (never narrower than 1 point, always inside 1-5) and is labelled, so small changes stay visible.
// A suppressed value (n<10) is a gap in the shape, never drawn as 0.

// `color` is a CSS colour (a var(--co-N) token); `dashed` marks a comparison period.
export type RadarSeries = {
  label: string;
  values: (number | null)[];
  color?: string;
  dashed?: boolean;
  /** Legacy two-series styling (manager page): used when `color` is not set. */
  tone?: "primary" | "compare";
};

const colorOf = (s: RadarSeries) => s.color ?? (s.tone === "compare" ? "var(--chart-2)" : "var(--chart-1)");
const dashedOf = (s: RadarSeries) => s.dashed ?? s.tone === "compare";

const SIZE = 420;
const C = SIZE / 2;
const R = 130;

const angle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

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
          fill={colorOf(s)}
          stroke="none"
          fillOpacity={0.1}
        />
      )}
      {edges.map(({ p, q, key }) => (
        <line
          key={key}
          x1={p.x} y1={p.y} x2={q.x} y2={q.y}
          stroke={colorOf(s)}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={dashedOf(s) ? "5 4" : undefined}
        />
      ))}
      {pts.map((p, i) =>
        p ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill={colorOf(s)} className="stroke-surface" strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={12} fill="transparent">
              <title>{`${s.label}: ${s.values[i]!.toFixed(1)}`}</title>
            </circle>
          </g>
        ) : null,
      )}
    </g>
  );
}

export async function Radar({ axes, series, legend = true }: { axes: string[]; series: RadarSeries[]; /** Off when colour-coded chips above already name the series. */ legend?: boolean }) {
  const { t, lang } = await getTL(hrResultsDict);
  const fmt = (v: number) => numD(v, lang, 1);
  // Axes arrive as domain names (data); shown in the UI language.
  const axisLabels = axes.map((a) => domainLabel(a, lang));
  const n = axes.length;
  const sc = scaleFor(series);
  const rings = sc.rings;
  return (
    <figure className="space-y-3">
      {legend && (
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-5"
              style={{ background: colorOf(s), ...(dashedOf(s) ? { maskImage: "repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 9px)" } : {}) }}
            />
            {s.label}
          </span>
        ))}
      </div>
      )}
      <svg
        viewBox={`-80 25 ${SIZE + 160} ${SIZE - 30}`}
        className="mx-auto w-full max-w-[48rem] text-muted"
        role="img"
        aria-label={t("rd_aria", { lo: fmt(sc.lo), hi: fmt(sc.hi), series: series.map((s) => s.label).join(t("rd_and")) })}
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
        {axisLabels.map((a, i) => {
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
                  {series.length > 1 ? `${s.label.split(" · ")[0]}: ${t("rd_supp", { min: MIN_GROUP_SIZE })}` : t("rd_supp", { min: MIN_GROUP_SIZE })}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-xs text-subtle">
        {sc.full ? t("rd_cap_full") : t("rd_cap_zoom", { lo: fmt(sc.lo), hi: fmt(sc.hi) })}
        {sc.rings.includes(3) && sc.lo < 3 ? t("rd_cap_dash") : ""}. {t("rd_cap_end", { min: MIN_GROUP_SIZE })}
      </figcaption>
    </figure>
  );
}
