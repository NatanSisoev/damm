import { MIN_GROUP_SIZE } from "@damm/shared";
import { People } from "../glyphs";
import { SuppressedBadge } from "../ui-server";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsKey } from "@/lib/i18n/hr-results";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { ChangeBadge, Sparkline } from "../trend";
import {
  REP_GAP_FLAG,
  type RepRow,
  type TrendRow,
} from "@damm/db/hr";



export function Bar({ value, tone }: { value: number; tone: "chart" | "muted" }) {
  return (
    <div className={`hr-meter w-full max-w-36 ${tone === "muted" ? "hr-meter-muted" : ""}`}>
      <span style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export async function RepTable({ rows, byShift }: { rows: RepRow[]; byShift: boolean }) {
  const { t, lang } = await getTL(hrResultsDict);
  const pct = (v: number) => `${numD(v * 100, lang, 1)}%`;
  const gapLabel = (g: number) => `${g >= 0 ? "+" : "−"}${numD(Math.abs(g * 100), lang, 1)} pp`;
  const hintFor = (motiu: "primari" | "complementari" | null) =>
    motiu === "complementari" ? t("hint_comp") : t("hint_small", { min: MIN_GROUP_SIZE });
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>{byShift ? t("tb_coll_shift") : t("tb_coll")}</th>
          <th>{t("tb_resp")}</th>
          <th>{t("tb_pop")}</th>
          <th className="text-right">{t("tb_gap")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="font-medium">{byShift ? `${collectiveLabel(r.collectiu, lang)} · ${r.torn ? shiftLabel(r.torn, lang) : ""}` : collectiveLabel(r.collectiu, lang)}</td>
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
                    <span className="num text-xs whitespace-nowrap text-muted">{pct(r.respShare!)} · <People n={r.respondents} /></span>
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

export async function TrendTable({ periodes, rows }: { periodes: string[]; rows: TrendRow[] }) {
  const { t, lang } = await getTL(hrResultsDict);
  const hintFor = (motiu: "primari" | "complementari" | null) =>
    motiu === "complementari" ? t("hint_comp") : t("hint_small", { min: MIN_GROUP_SIZE });
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>{t("tb_domain")}</th>
          {periodes.map((p) => <th key={p} className="text-right">{p}</th>)}
          <th className="text-right">{t("tb_trend")}</th>
          <th className="text-right">{t("tb_change")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domini}>
            <td className="font-medium">{domainLabel(r.domini, lang)}</td>
            {r.cells.map((c, i) => (
              <td key={i} className="num text-right">
                {c.suprimit ? (
                  <SuppressedBadge title={hintFor(c.motiu)} />
                ) : c.mitjana === null ? (
                  <span className="text-subtle">–</span>
                ) : (
                  <div>
                    <div>{numD(c.mitjana, lang, 1)}</div>
                    <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}>
                      <People n={c.n} /> · {t(`prec_${c.precisio === "sòlida" ? "solida" : c.precisio}` as HrResultsKey)}
                    </div>
                    {c.sd !== null && c.consensus !== null && (
                      <div className="text-[11px] whitespace-nowrap text-subtle">{t("tb_sd_cons", { sd: numD(c.sd, lang, 1), c: Math.round(c.consensus) })}</div>
                    )}
                  </div>
                )}
              </td>
            ))}
            <td className="text-right"><Sparkline values={r.cells.map((c) => c.mitjana)} /></td>
            <td className="text-right"><ChangeBadge canvi={r.canvi} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

