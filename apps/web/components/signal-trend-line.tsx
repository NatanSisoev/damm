// What a signal says, in one line: short label, bold signed delta and a small sparkline of the series.
// Signals without a series fall back to the sentence from lib/signal-text.ts.
import type { Lang } from "@damm/shared";
import { signalDetail, signalTrend, type SignalLike, type SignalTrend } from "@/lib/signal-text";

const W = 64, H = 20, PAD = 4;

/** 64×20 line of the series, drawn on its own min–max range (no axes). Points show their name and value on hover or keyboard focus. */
function TrendSpark({ trend, lang }: { trend: SignalTrend; lang: Lang }) {
  const { values, names } = trend;
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * (W - 2 * PAD),
    y: hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD),
  }));
  const shown = (v: number) => {
    const raw = Number.isInteger(v) ? String(v) : v.toFixed(1);
    return lang === "en" ? raw : raw.replace(".", ",");
  };
  const lastPt = pts[pts.length - 1];
  return (
    <span role="group" aria-label={trend.aria} className="relative inline-block align-middle" style={{ width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="block text-ink">
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastPt.x} cy={lastPt.y} r="2.5" fill="currentColor" />
      </svg>
      {pts.map((p, i) => {
        const text = `${names[i] ? `${names[i]}: ` : ""}${shown(values[i])}`;
        return (
          <span
            key={i}
            tabIndex={0}
            aria-label={text}
            className="group absolute block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            style={{ left: p.x, top: p.y }}
          >
            <span role="tooltip" className="num pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-ink px-1.5 py-0.5 text-[11px] text-bg group-hover:block group-focus:block">
              {text}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function SignalTrendLine({ trend, lang }: { trend: SignalTrend; lang: Lang }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>{trend.label}</span>
      <span aria-hidden="true">·</span>
      <span><strong className="num font-semibold text-ink">{trend.delta}</strong> {trend.unit}</span>
      <TrendSpark trend={trend} lang={lang} />
    </span>
  );
}

/** The trend line when the signal has a series, else its sentence. */
export function SignalSummary({ s, lang }: { s: Pick<SignalLike, "tipus" | "descripcio" | "periode">; lang: Lang }) {
  const trend = signalTrend(s, lang);
  return trend ? <SignalTrendLine trend={trend} lang={lang} /> : <>{signalDetail(s, lang)}</>;
}
