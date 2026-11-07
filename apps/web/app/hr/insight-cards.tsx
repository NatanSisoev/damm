// Engine insight cards (C4/C5). Rendered per kind from InsightDetails; suppressed rows are never passed in.
import type { ReactNode } from "react";
import type { Lang } from "@damm/shared";
import { nLabel } from "@damm/db/hr";
import type { InsightView } from "@/lib/hr-engine";
import { getTL } from "@/lib/i18n/server";
import { hrDict, hrLookup } from "@/lib/i18n/hr";
import { LOCALES, type TFn } from "@/lib/i18n/core";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { rich } from "@/lib/i18n/rich";

const KINDS = new Set(["domain_state", "top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"]);

const pct = (v: number) => `${Math.round(v)}%`;

type Fmt = { f1: (v: number) => string; signed: (v: number) => string };
const makeFmt = (lang: Lang): Fmt => {
  const f1 = (v: number) => v.toLocaleString(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return { f1, signed: (v) => `${v >= 0 ? "+" : "−"}${f1(Math.abs(v))}` };
};

function where(l: { collective: string; shift: string | null; domain: string | null }, t: TFn<keyof (typeof hrDict)["ca"]>, lang: Lang) {
  return [
    l.domain ? domainLabel(l.domain, lang) : null,
    l.collective === "All" ? t("all_company") : collectiveLabel(l.collective, lang),
    l.shift ? shiftLabel(l.shift, lang) : null,
  ].filter(Boolean).join(" · ");
}

const num = (x: ReactNode) => <span className="num font-semibold">{x}</span>;

function Body({ i, t, lang }: { i: InsightView; t: TFn<keyof (typeof hrDict)["ca"]>; lang: Lang }) {
  if (!i.detail) return null;
  const { f1, signed } = makeFmt(lang);
  switch (i.kind) {
    case "domain_state": {
      const d = i.detail;
      const delta = d.delta !== null ? t("ins_vs_prev", { d: signed(d.delta) }) : "";
      return (
        <p>
          {rich(t("ins_domain_state_body", { score: "{score}", delta, conf: pct(d.current.confidence), cons: pct(d.current.consensus) }), {
            score: <span className="num font-semibold">{f1(d.current.score)}</span>,
          })}
        </p>
      );
    }
    case "top_mover": {
      const d = i.detail;
      return (
        <p>
          {rich(t("ins_top_mover_body", { dir: d.direction === "up" ? t("ins_mover_up") : t("ins_mover_down"), delta: "{delta}", from: f1(d.previous.score), to: f1(d.current.score) }), {
            delta: <span className="num font-semibold">{signed(d.delta)}</span>,
          })}
        </p>
      );
    }
    case "polarisation": {
      const d = i.detail;
      return (
        <p>
          {t("ins_polarisation_body", { drop: Math.round(d.consensusDrop), cons: pct(d.current.consensus), score: f1(d.current.score), delta: signed(d.scoreDelta) })}
        </p>
      );
    }
    case "importance_gap": {
      const d = i.detail;
      return (
        <p>
          {rich(t("ins_importance_body", { imp: pct(d.importance * 100), score: f1(d.score), quad: "{quad}" }), {
            quad: <span className="badge">{hrLookup("quad_", d.quadrant, lang)}</span>,
          })}
        </p>
      );
    }
    case "trajectory_mix": {
      const d = i.detail;
      return (
        <p>
          {rich(t("ins_trajectory_body", { up: "{up}", stable: "{stable}", down: "{down}" }), {
            up: <span className="num">{pct(d.improving)}</span>,
            stable: <span className="num">{pct(d.stable)}</span>,
            down: <span className="num">{pct(d.declining)}</span>,
          })}
          <span className="text-subtle">{t("ins_trajectory_window", { days: d.windowDays })}</span>
        </p>
      );
    }
    case "followup_confirmation": {
      const d = i.detail;
      return (
        <p>
          {rich(t("ins_followup_body", { rate: "{rate}", confirmed: d.confirmed, resolved: d.resolved }), { rate: num(pct(d.rate)) })}
        </p>
      );
    }
    case "segment_gap": {
      const d = i.detail;
      return d.dimension === "shift" ? (
        <p>
          {rich(
            t("ins_gap_shift_body", {
              gap: "{gap}",
              lo: shiftLabel(d.lowest.label ?? "—", lang),
              loScore: f1(d.lowest.score),
              hi: shiftLabel(d.highest.label ?? "—", lang),
              hiScore: f1(d.highest.score),
            }),
            { gap: num(f1(d.gap)) },
          )}
        </p>
      ) : (
        <p>{t("ins_gap_managers_body", { managers: f1(d.managers.score), others: f1(d.others.score), gap: f1(d.gap) })}</p>
      );
    }
    default:
      return null;
  }
}

export async function InsightCards({ insights, empty }: { insights: InsightView[]; empty: string }) {
  const { t, lang } = await getTL(hrDict);
  const visible = insights.filter((i) => !i.suppressed && i.detail && KINDS.has(i.kind));
  if (visible.length === 0) return <p className="text-[13px] text-subtle">{empty}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {visible.map((i) => {
        const labels = (i.detail as { labels: { collective: string; shift: string | null; domain: string | null } }).labels;
        return (
          <li key={i.id} className="rounded-lg border border-line p-3 text-[13px]">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="badge">{hrLookup("ins_", i.kind, lang)}</span>
              <span className="num ml-auto text-xs text-subtle">{nLabel(i.n, i.collectiuId !== null || i.tornId !== null)}</span>
            </div>
            <div className="mb-1 text-xs text-subtle">{where(labels, t, lang)}</div>
            <Body i={i} t={t} lang={lang} />
          </li>
        );
      })}
    </ul>
  );
}
