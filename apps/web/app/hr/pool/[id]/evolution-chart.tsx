import type { PoolWeek } from "@/lib/hr-engine";
import { getTL } from "@/lib/i18n/server";
import { poolDict } from "@/lib/i18n/hr-pool";
import { numD } from "@/lib/i18n/num";

const W = 860;
const L = 34;
const R = 16;
const IW = W - L - R;
const TOP = { y: 30, h: 180 }; // score panel
const BOT = { y: 262, h: 60 }; // volume panel
const H = BOT.y + BOT.h + 26;

const fmt = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Mean score with a ±1 SD band, the running mean, and the daily or weekly volume underneath. Scores are shown on 0–10. */
export async function EvolutionChart({ buckets, grain }: { buckets: PoolWeek[]; grain: "week" | "day" }) {
  const { t, lang } = await getTL(poolDict);
  const f1 = (v: number) => numD(v * 10, lang, 1);
  const n = buckets.length;
  const step = IW / n;
  const x = (i: number) => L + step * i + step / 2;
  const yS = (s: number) => TOP.y + TOP.h - (Math.min(1, Math.max(0, s)) * TOP.h);
  const maxN = Math.max(1, ...buckets.map((b) => Math.max(b.asked, b.responses)));
  const yN = (v: number) => BOT.y + BOT.h - (v / maxN) * BOT.h;
  const bw = Math.max(2, Math.min(26, step * 0.62));

  // Break the lines where a bucket has no score (under the minimum group size or no answers).
  const segments = (pick: (b: PoolWeek) => number | null) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    buckets.forEach((b, i) => {
      const v = pick(b);
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([x(i), yS(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const band = (pts: { x: number; lo: number; hi: number }[]) =>
    `M${pts.map((p) => `${p.x.toFixed(1)},${yS(p.hi).toFixed(1)}`).join("L")}L${[...pts].reverse().map((p) => `${p.x.toFixed(1)},${yS(p.lo).toFixed(1)}`).join("L")}Z`;

  const bands: { x: number; lo: number; hi: number }[][] = [];
  let cur: { x: number; lo: number; hi: number }[] = [];
  buckets.forEach((b, i) => {
    if (b.avgScore === null || b.sd === null) {
      if (cur.length) bands.push(cur);
      cur = [];
    } else cur.push({ x: x(i), lo: b.avgScore - b.sd, hi: b.avgScore + b.sd });
  });
  if (cur.length) bands.push(cur);

  const labelEvery = Math.max(1, Math.ceil(n / (grain === "day" ? 12 : 10)));
  const hasScore = buckets.some((b) => b.avgScore !== null);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-subtle" aria-label={t("c_legend")}>
        <li className="flex items-center gap-2"><span className="inline-block h-0.5 w-5" style={{ background: "var(--co-4)" }} />{t("c_mean")}</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-5" style={{ background: "var(--co-4)", opacity: 0.2 }} />{t("c_sd")}</li>
        <li className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "currentColor" }} />{t("c_cum")}</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3" style={{ background: "var(--co-2)" }} />{t("c_resp")}</li>
        <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 border" style={{ borderColor: "currentColor", opacity: 0.6 }} />{t("c_asked")}</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("c_aria")} className="w-full">
        {/* score panel */}
        {[0, 2.5, 5, 7.5, 10].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yS(v / 10)} y2={yS(v / 10)} stroke="currentColor" strokeOpacity={v === 0 ? 0.35 : 0.12} strokeDasharray={v === 0 ? undefined : "2 4"} />
            <text x={L - 8} y={yS(v / 10) + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">{v}</text>
          </g>
        ))}
        <text x={L} y={TOP.y - 14} fontSize="11" fontWeight="600" fill="currentColor" fillOpacity="0.7">{t("c_score_axis")}</text>
        {!hasScore && (
          <text x={W / 2} y={TOP.y + TOP.h / 2} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity="0.6">
            {t(grain === "day" ? "c_none_day" : "c_none_week", { n: 10 })}
          </text>
        )}
        {bands.map((b, i) => b.length > 1 && <path key={i} d={band(b)} fill="var(--co-4)" fillOpacity="0.18" />)}
        {segments((b) => b.cumMean).map((s, i) => s.length > 1 && <path key={i} d={line(s)} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" />)}
        {segments((b) => b.avgScore).map((s, i) => <path key={i} d={line(s)} fill="none" stroke="var(--co-4)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />)}
        {buckets.map((b, i) => b.avgScore !== null && <circle key={b.week} cx={x(i)} cy={yS(b.avgScore)} r={n > 40 ? 2 : 3.5} fill="var(--surface, #fff)" stroke="var(--co-4)" strokeWidth="2" />)}

        {/* volume panel */}
        <line x1={L} x2={W - R} y1={BOT.y + BOT.h} y2={BOT.y + BOT.h} stroke="currentColor" strokeOpacity="0.35" />
        <text x={L} y={BOT.y - 14} fontSize="11" fontWeight="600" fill="currentColor" fillOpacity="0.7">{t(grain === "day" ? "c_vol_day" : "c_vol_week")}</text>
        <text x={L - 8} y={BOT.y + 8} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">{maxN}</text>
        <text x={L - 8} y={BOT.y + BOT.h + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">0</text>
        {buckets.map((b, i) => (
          <g key={b.week}>
            {b.asked > 0 && <rect x={x(i) - bw / 2 - 1.5} y={yN(b.asked)} width={bw + 3} height={BOT.y + BOT.h - yN(b.asked)} fill="none" stroke="currentColor" strokeOpacity="0.5" />}
            <rect x={x(i) - bw / 2} y={yN(b.responses)} width={bw} height={BOT.y + BOT.h - yN(b.responses)} fill="var(--co-2)" fillOpacity="0.85" />
            {i % labelEvery === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">{fmt(b.week)}</text>}
          </g>
        ))}

        {/* hover targets */}
        {buckets.map((b, i) => (
          <rect key={b.week} x={x(i) - step / 2} y={TOP.y} width={step} height={BOT.y + BOT.h - TOP.y} fill="transparent">
            <title>
              {`${t(grain === "day" ? "c_tip_day" : "c_tip_week", { d: b.week })}\n${t("c_tip_counts", { r: b.responses, a: b.asked })}${
                b.avgScore === null ? `\n${t("c_tip_suppressed", { n: 10 })}` : `\n${t("c_tip_score", { s: `${f1(b.avgScore)}${b.sd === null ? "" : ` ± ${f1(b.sd)}`}` })}`
              }${b.cumMean === null ? "" : `\n${t("c_tip_cum", { s: f1(b.cumMean) })}`}`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
