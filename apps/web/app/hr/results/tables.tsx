import { MIN_GROUP_SIZE } from "@damm/shared";
import { SuppressedBadge } from "../ui";
import { num1, tornLabel } from "@/lib/format";
import { ChangeBadge, Sparkline } from "../trend";
import {
  REP_GAP_FLAG,
  type RepRow,
  type TrendRow,
} from "@damm/db/hr";

const pct = (v: number) => `${num1(v * 100)}%`;
const gapLabel = (g: number) => `${g >= 0 ? "+" : "−"}${num1(Math.abs(g * 100))} pp`;
export const suppressedHint = `Menys de ${MIN_GROUP_SIZE} persones han respost`;
const complementaryHint = "Ocult per protegir un grup petit: no es pot deduir per resta";
const hintFor = (motiu: "primari" | "complementari" | null) => (motiu === "complementari" ? complementaryHint : suppressedHint);


export function Bar({ value, tone }: { value: number; tone: "chart" | "muted" }) {
  return (
    <div className={`hr-meter w-full max-w-36 ${tone === "muted" ? "hr-meter-muted" : ""}`}>
      <span style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function RepTable({ rows, byShift }: { rows: RepRow[]; byShift: boolean }) {
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>{byShift ? "Col·lectiu · torn" : "Col·lectiu"}</th>
          <th>Respostes</th>
          <th>Població</th>
          <th className="text-right">Diferència</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="font-medium">{byShift ? `${r.collectiu} · ${r.torn ? tornLabel(r.torn) : ""}` : r.collectiu}</td>
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
                    <span className="num text-xs whitespace-nowrap text-muted">{pct(r.respShare!)} · n={r.respondents}</span>
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

export function TrendTable({ periodes, rows }: { periodes: string[]; rows: TrendRow[] }) {
  return (
    <table className="table min-w-[36rem]">
      <thead>
        <tr>
          <th>Domini</th>
          {periodes.map((p) => <th key={p} className="text-right">{p}</th>)}
          <th className="text-right">Tendència</th>
          <th className="text-right">Canvi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domini}>
            <td className="font-medium">{r.domini}</td>
            {r.cells.map((c, i) => (
              <td key={i} className="num text-right">
                {c.suprimit ? (
                  <SuppressedBadge title={hintFor(c.motiu)} />
                ) : c.mitjana === null ? (
                  <span className="text-subtle">–</span>
                ) : (
                  <div>
                    <div>{num1(c.mitjana)}</div>
                    <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}>
                      n={c.n} · {c.precisio}
                    </div>
                    {c.sd !== null && c.consensus !== null && (
                      <div className="text-[11px] whitespace-nowrap text-subtle">±{c.sd.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · consens {Math.round(c.consensus)}%</div>
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

