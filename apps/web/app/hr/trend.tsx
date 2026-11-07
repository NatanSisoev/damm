import { CHANGE_MIN_DELTA, CHANGE_MIN_N, type Change } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { num2L } from "@/lib/i18n/num";

/** Mean on the 1–5 scale. Each sparkline is drawn on the 1–5 scale so small moves stay small. */
export async function Sparkline({ values }: { values: (number | null)[] }) {
  const { t } = await getTL(hrResultsDict);
  const w = 80, h = 24;
  const pts = values
    .map((v, i) => (v === null ? null : { x: (i / Math.max(1, values.length - 1)) * (w - 8) + 4, y: h - 4 - ((v - 1) / 4) * (h - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label={t("tr_spark_aria")} className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-chart-1" />)}
    </svg>
  );
}

export async function ChangeBadge({ canvi }: { canvi: Change }) {
  const { t, lang } = await getTL(hrResultsDict);
  // canvi.label is a data value (puja | baixa | sense canvi clar): compare it raw, show it translated.
  if (canvi.label === "sense canvi clar") {
    return (
      <span className="text-xs text-subtle" title={t("tr_nochange_title", { delta: num2L(CHANGE_MIN_DELTA, lang), n: CHANGE_MIN_N })}>
        {t("tr_nochange")}
      </span>
    );
  }
  const up = canvi.label === "puja";
  const signed = `${canvi.delta! >= 0 ? "+" : "−"}${num2L(Math.abs(canvi.delta!), lang)}`;
  return (
    <span className="badge num" title={t("tr_delta_title", { v: signed })}>
      {up ? t("tr_up") : t("tr_down")} {signed}
    </span>
  );
}
