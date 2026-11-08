import type { ReactNode } from "react";
import type { SignalRecommendation } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { panelDict } from "@/lib/i18n/hr-panel";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-subtle">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

/** What the AI proposes and why: shared by the recommendation page and the modal on the alarm. */
export async function ProposalBody({ r }: { r: Pick<SignalRecommendation, "text" | "iniciativa" | "responsableSuggerit" | "terminiSuggerit" | "font" | "justificacio" | "limits"> }) {
  const { t } = await getTL(panelDict);
  return (
    <>
      <p className="proposal-main text-[15px]">{r.text}</p>
      <dl className="proposal-facts mt-4 grid gap-4 sm:grid-cols-2">
        {r.iniciativa && <Fact label={t("rd_f_initiative")}>{r.iniciativa}</Fact>}
        {r.responsableSuggerit && <Fact label={t("rd_f_owner")}>{r.responsableSuggerit}</Fact>}
        {r.terminiSuggerit && <Fact label={t("rd_f_deadline")}>{r.terminiSuggerit}</Fact>}
        <Fact label={t("rd_f_origin")}>{r.font === "llm" ? t("rd_origin_llm") : r.font === "template" ? t("rd_origin_template") : t("rd_origin_none")}</Fact>
      </dl>
      <div className="proposal-notes">
      {r.justificacio && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold text-subtle">{t("rd_why")}</h3>
          <p className="mt-1 text-[13px] text-muted">{r.justificacio}</p>
        </div>
      )}
      {r.limits && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold text-subtle">{t("rd_limits")}</h3>
          <p className="mt-1 text-[13px] text-muted">{r.limits}</p>
        </div>
      )}
      </div>
      <p className="mt-4 text-xs text-subtle">{t("rd_ai_note")}</p>
    </>
  );
}
