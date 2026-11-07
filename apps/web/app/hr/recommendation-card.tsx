import type { ReactNode } from "react";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";

interface RecommendationBody {
  text: string;
  titol?: string | null;
  iniciativa?: string | null;
  responsableSuggerit?: string | null;
  terminiSuggerit?: string | null;
  justificacio?: string | null;
  limits?: string | null;
  font?: "llm" | "template" | null;
  aprovadaEl?: string | null;
}

/** Structured body of a recommendation: what, who, when, why, limits and source. No "done" state: HR only approves or discards. */
export async function RecommendationBody({ r }: { r: RecommendationBody }): Promise<ReactNode> {
  const t = await getT(hrDict);
  return (
    <div className="space-y-2">
      {r.titol && <h3 className="font-medium">{r.titol}</h3>}
      <p>{r.text}</p>
      {r.iniciativa && <p className="text-[13px]"><span className="font-medium">{t("rc_initiative")}</span> {r.iniciativa}</p>}
      {(r.responsableSuggerit || r.terminiSuggerit) && (
        <p className="text-[13px] text-muted">
          {r.responsableSuggerit && <>{t("rc_owner", { v: r.responsableSuggerit })}</>}
          {r.responsableSuggerit && r.terminiSuggerit && " · "}
          {r.terminiSuggerit && <>{t("rc_term", { v: r.terminiSuggerit })}</>}
        </p>
      )}
      {r.justificacio && <p className="text-[13px] text-muted"><span className="font-medium">{t("rc_why")}</span> {r.justificacio}</p>}
      {r.limits && <p className="text-xs text-subtle"><span className="font-medium">{t("rc_limits")}</span> {r.limits}</p>}
      <p className="text-xs text-subtle">
        {r.font === "llm" ? t("rc_by_ai") : r.font === "template" ? t("rc_by_template") : null}
        {r.aprovadaEl && <>{r.font ? " · " : ""}{t("rc_approved_on", { date: r.aprovadaEl.slice(0, 10) })}</>}
      </p>
    </div>
  );
}
