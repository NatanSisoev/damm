"use client";

// Multi-line chart of the domain means per period (plain SVG, one y axis). Every domain has its own colour;
// domains with a clear change are drawn thicker and labelled in bold. Suppressed (n < min group size) points are never drawn: gap in the line.
// Spread band (mean ± 1 SD, clamped to 1-5): always drawn for highlighted series when `highlight` is set; otherwise
// only for the series being hovered/focused, so six overlapping bands do not turn the chart into a smear.
import { useEffect, useRef, useState } from "react";
import type { TrendRow } from "@damm/db/hr";
import { useLang, useT } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/core";
import { hrResultsDict, type HrResultsKey } from "@/lib/i18n/hr-results";
import { domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";

const H = 300;
const PAD = { top: 14, bottom: 30, left: 34 };

type Pt = { x: number; y: number; v: number; n: number | null; precisio: string | null; pi: number; lo: number | null; hi: number | null };
export type TrendScale = "1-5" | "0-10";
// Values arrive on 1-5 (agregat.mitjana, SD of 1-5 answers). On the 0-10 scale (same as the signal headline, score = (mean - 1) x 2.5) both are rescaled.
const scaleOf = (scale: TrendScale) => (scale === "0-10" ? { min: 0, max: 10, k: 2.5 } : { min: 1, max: 5, k: 1 });

// `highlight`: domain names to emphasise (coloured, thicker); all others muted. Without it, all are coloured and clear changes are thicker.
// Consensus and confidence (0-100) never share the score's axis: each gets its own small panel under it, toggled by a chip.
// `defaultMetrics` opens panels from the start (a polarisation alarm opens consensus, a low-confidence alarm opens confidence).
export type TrendMetric = "consensus" | "confidence";
const METRICS: TrendMetric[] = ["consensus", "confidence"];
export function TrendChart({ periodes, rows, highlight, scale = "1-5", defaultMetrics = [] }: { periodes: string[]; rows: TrendRow[]; highlight?: string[]; scale?: TrendScale; defaultMetrics?: TrendMetric[] }) {
  const tr = useT(hrResultsDict);
  const lang = useLang();
  const f1 = (v: number) => numD(v, lang, 1);
  const f0 = (v: number) => Math.round(v).toLocaleString(LOCALES[lang]);
  // Precision is a data value (indicativa | moderada | sòlida): shown translated.
  const prec = (x: string | null) => (x ? tr(`prec_${x === "sòlida" ? "solida" : x}` as HrResultsKey) : "");
  const dom = (name: string) => domainLabel(name, lang);
  const scoreLabel = scale === "0-10" ? tr("ch_score") : tr("ch_mean");
  const sc = scaleOf(scale);
  const tv = (v: number) => scale === "0-10" ? (v - 1) * 2.5 : v;
  const bandOf = (v: number, sd: number | null) => (sd === null ? { lo: null, hi: null } : { lo: Math.max(sc.min, tv(v) - sd * sc.k), hi: Math.min(sc.max, tv(v) + sd * sc.k) });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [active, setActive] = useState<{ ri: number; pi: number } | null>(null);
  const [metrics, setMetrics] = useState<TrendMetric[]>(defaultMetrics);
  const [mActive, setMActive] = useState<{ m: TrendMetric; ri: number; pi: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const available = METRICS.filter((m) => rows.some((r) => r.cells.some((c) => !c.suprimit && c[m] !== null)));
  const values = rows.flatMap((r) => r.cells.map((c) => (c.suprimit || c.mitjana === null ? null : tv(c.mitjana)))).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  // The axis must contain every band that can be shown (stable: it does not jump on hover).
  const extents = rows.flatMap((r) =>
    !highlight || highlight.includes(r.domini)
      ? r.cells.flatMap((c) => (c.suprimit || c.mitjana === null ? [] : Object.values(bandOf(c.mitjana, c.sd)).filter((v): v is number => v !== null)))
      : [],
  );
  values.push(...extents);

  // Zoomed axis from the data: round down/up to 0.5, at least 1 point of range, inside 1-5.
  let lo = Math.floor(Math.min(...values) * 2) / 2;
  let hi = Math.ceil(Math.max(...values) * 2) / 2;
  if (hi - lo < 1) hi = lo + 1;
  if (hi > sc.max) { hi = sc.max; lo = Math.min(lo, sc.max - 1); }
  if (lo < sc.min) { lo = sc.min; hi = Math.max(hi, sc.min + 1); }
  const ticks: number[] = [];
  const step = hi - lo > 4 ? 1 : 0.5;
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

  const narrow = w < 520;
  const right = narrow ? 112 : 190;
  const plotL = PAD.left, plotR = w - right;
  const yOf = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const xOf = (i: number) => (periodes.length < 2 ? (plotL + plotR) / 2 : plotL + 12 + (i / (periodes.length - 1)) * (plotR - plotL - 24));
  const maxChars = Math.floor((right - 10) / 6.2);
  const clip = (s: string, extra: number) => (s.length + extra > maxChars ? s.slice(0, Math.max(4, maxChars - extra - 1)).trimEnd() + "…" : s);

  const series = rows.map((r, ri) => {
    const pts: (Pt | null)[] = r.cells.map((c, pi) =>
      c.suprimit || c.mitjana === null ? null : { x: xOf(pi), y: yOf(tv(c.mitjana)), v: tv(c.mitjana), n: c.n, precisio: c.precisio, pi, ...bandOf(c.mitjana, c.sd) },
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

  // Every domain keeps its own colour; only with `highlight` are the others muted.
  const colorOf = (s: { ri: number; changed: boolean }) => (highlight && !s.changed ? "var(--dom-muted)" : `var(--dom-${(s.ri % 6) + 1})`);

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


  return (
    <div className="px-5 py-4">
      {available.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {available.map((m) => {
            const on = metrics.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setMetrics((cur) => (on ? cur.filter((x) => x !== m) : [...cur, m]))}
                className={`border px-2 py-0.5 ${on ? "border-ink bg-ink text-surface" : "border-line text-subtle hover:text-ink"}`}
              >
                {on ? "✓ " : "+ "}{tr(m === "consensus" ? "ch_m_consensus" : "ch_m_confidence")}
              </button>
            );
          })}
        </div>
      )}
      <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setActive(null)}>
        <svg width={w} height={H} role="img" aria-label={scale === "0-10" ? tr("ch_aria_score") : tr("ch_aria_mean")} className="block max-w-full">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={plotL} x2={plotR} y1={yOf(v)} y2={yOf(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={plotL - 8} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)" className="num">{f1(v)}</text>
            </g>
          ))}
          {periodes.map((p, i) => (
            <text key={p} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-subtle)" className="num">{p}</text>
          ))}
          {ordered.map((s) => {
            const color = colorOf(s);
            const dim = active && active.ri !== s.ri ? 0.35 : 1;
            const showBand = highlight ? s.changed : active?.ri === s.ri;
            const bandPts = showBand ? s.pts.map((p) => (p && p.lo !== null && p.hi !== null ? p : null)) : [];
            return (
              <g key={s.r.domini} opacity={dim}>
                {segments(bandPts).map((seg, k) => {
                  if (seg.length === 1) {
                    const p = seg[0];
                    return <rect key={`b${k}`} x={p.x - 5} y={yOf(p.hi!)} width={10} height={Math.max(1, yOf(p.lo!) - yOf(p.hi!))} fill={color} fillOpacity={0.13} aria-hidden />;
                  }
                  const up = seg.map((p) => `${p.x},${yOf(p.hi!)}`);
                  const down = [...seg].reverse().map((p) => `${p.x},${yOf(p.lo!)}`);
                  return <polygon key={`b${k}`} points={[...up, ...down].join(" ")} fill={color} fillOpacity={0.13} stroke="none" aria-hidden />;
                })}
                {segments(s.pts).map((seg, k) =>
                  seg.length > 1 ? (
                    <polyline key={k} points={seg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={s.changed ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
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
                  {clip(dom(s.r.domini), val.length + 1)} <tspan className="num">{val}</tspan>
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
                  aria-label={
                    tr("ch_pt_aria", { domain: dom(s.r.domini), period: periodes[pi], v: f1(p.v), n: p.n ?? "", prec: prec(p.precisio) }) +
                    (s.r.cells[pi].sd !== null ? tr("ch_pt_sd", { v: f1(s.r.cells[pi].sd! * sc.k) }) : "") +
                    (s.r.cells[pi].consensus !== null ? tr("ch_pt_cons", { v: f0(s.r.cells[pi].consensus!) }) : "")
                  }
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
            style={{ left: Math.min(Math.max(actPt.x + 12, 0), w - 190), top: Math.max(0, actPt.y - 84), width: 180 }}
          >
            <div className="font-semibold">{dom(act.r.domini)}</div>
            <div className="num text-subtle">{periodes[active.pi]}</div>
            <div className="num mt-1">{tr("ch_tip_val", { label: scoreLabel, v: f1(actPt.v), max: sc.max })}</div>
            {actCell.sd !== null && <div className="num">{tr("ch_tip_sd", { v: f1(actCell.sd * sc.k) })}</div>}
            {actCell.consensus !== null && <div className="num">{tr("ch_tip_cons", { v: f0(actCell.consensus) })}</div>}
            <div className="num text-subtle">{tr("ch_tip_n", { n: actCell.n ?? "", prec: prec(actCell.precisio) })}</div>
          </div>
        )}
      </div>

      {METRICS.filter((m) => metrics.includes(m) && available.includes(m)).map((m) => {
        const PH = 130, PT = 10, PB = 22;
        const vals = rows.flatMap((r) => r.cells.map((c) => (c.suprimit ? null : c[m]))).filter((v): v is number => v !== null);
        // Zoomed to the data in steps of 10 (at least 20 points of range) so a drop is visible; inside 0-100.
        let mlo = Math.max(0, Math.floor(Math.min(...vals) / 10) * 10 - 10);
        let mhi = Math.min(100, Math.ceil(Math.max(...vals) / 10) * 10 + 10);
        if (mhi - mlo < 20) { if (mhi < 100) mhi = Math.min(100, mlo + 20); else mlo = mhi - 20; }
        const mstep = mhi - mlo > 50 ? 20 : 10;
        const mticks: number[] = [];
        for (let v = mlo; v <= mhi + 1e-9; v += mstep) mticks.push(v);
        const my = (v: number) => PT + (1 - (v - mlo) / (mhi - mlo)) * (PH - PT - PB);
        const mser = series.map((s) => ({ ...s, mp: s.r.cells.map((c, pi) => (c.suprimit || c[m] === null ? null : { x: xOf(pi), y: my(c[m]!), v: c[m]!, pi })) }));
        const mordered = [...mser].sort((a, b) => Number(a.changed) - Number(b.changed));
        const ma = mActive && mActive.m === m ? mser[mActive.ri] : null;
        const maPt = ma && mActive ? ma.mp[mActive.pi] : null;
        const title = tr(m === "consensus" ? "ch_m_consensus" : "ch_m_confidence");
        return (
          <div key={m} className="mt-3 border-t border-line pt-2">
            <div className="text-xs font-semibold">{title} <span className="font-normal text-subtle">{tr(m === "consensus" ? "ch_m_consensus_hint" : "ch_m_confidence_hint")}</span></div>
            <div className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setMActive(null)}>
              <svg width={w} height={PH} role="img" aria-label={title} className="block max-w-full">
                {mticks.map((v) => (
                  <g key={v}>
                    <line x1={plotL} x2={plotR} y1={my(v)} y2={my(v)} stroke="var(--border)" strokeWidth="1" />
                    <text x={plotL - 8} y={my(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)" className="num">{v}</text>
                  </g>
                ))}
                {periodes.map((p, i) => (
                  <text key={p} x={xOf(i)} y={PH - 6} textAnchor="middle" fontSize="11" fill="var(--text-subtle)" className="num">{p}</text>
                ))}
                {mordered.map((s) => {
                  const color = colorOf(s);
                  const segs: { x: number; y: number }[][] = [];
                  let cur: { x: number; y: number }[] = [];
                  for (const p of s.mp) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
                  if (cur.length) segs.push(cur);
                  const last = [...s.mp].reverse().find((p) => p !== null);
                  return (
                    <g key={s.r.domini} opacity={ma && ma.ri !== s.ri ? 0.35 : 1}>
                      {segs.map((seg, k) => seg.length > 1 ? <polyline key={k} points={seg.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={s.changed ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" /> : null)}
                      {s.mp.map((p, pi) => p ? <circle key={pi} cx={p.x} cy={p.y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" /> : null)}
                      {last && s.changed && (
                        <text x={plotR + 12} y={last.y + 4} fontSize="11.5" fontWeight={700} fill="var(--text)" className="num">{f0(last.v)}</text>
                      )}
                    </g>
                  );
                })}
                {mser.map((s) => s.mp.map((p, pi) => p ? (
                  <circle key={`${s.ri}-${pi}`} cx={p.x} cy={p.y} r="12" fill="transparent" tabIndex={0}
                    aria-label={`${dom(s.r.domini)}, ${periodes[pi]}: ${title} ${f0(p.v)}`}
                    onMouseEnter={() => setMActive({ m, ri: s.ri, pi })} onFocus={() => setMActive({ m, ri: s.ri, pi })}
                    onBlur={() => setMActive(null)} onPointerDown={() => setMActive({ m, ri: s.ri, pi })} style={{ outline: "none" }} />
                ) : null))}
              </svg>
              {ma && maPt && mActive && (
                <div role="status" className="pointer-events-none absolute z-10 border border-line bg-surface px-3 py-2 text-xs shadow-sm"
                  style={{ left: Math.min(Math.max(maPt.x + 12, 0), w - 190), top: Math.max(0, maPt.y - 60), width: 180 }}>
                  <div className="font-semibold">{dom(ma.r.domini)}</div>
                  <div className="num text-subtle">{periodes[mActive.pi]}</div>
                  <div className="num mt-1">{title} {f0(maPt.v)}/100</div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" aria-label={tr("ch_legend")}>
        {series.map((s) => (
          <li key={s.r.domini} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: colorOf(s) }} />
            <span className={s.changed ? "font-semibold" : "text-subtle"}>
              {dom(s.r.domini)}
              {s.changed && s.r.canvi.delta !== null && s.r.canvi.label !== "sense canvi clar" && <span className="num"> · {s.r.canvi.label === "puja" ? "↑" : "↓"} {s.r.canvi.delta! >= 0 ? "+" : "−"}{numD(Math.abs(s.r.canvi.delta!), lang, 2)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
