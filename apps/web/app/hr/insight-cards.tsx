// Engine insight cards (C4/C5). Rendered per kind from InsightDetails; suppressed rows are never passed in.
import type { InsightView } from "@/lib/hr-engine";
import { People } from "./glyphs";
import { fixShifts, tornLabel } from "@/lib/format";

const KIND_TITLE: Record<string, string> = {
  domain_state: "Estat del domini",
  top_mover: "Canvi destacat",
  polarisation: "Polarització",
  importance_gap: "Importància i puntuació",
  trajectory_mix: "Trajectòries",
  followup_confirmation: "Confirmació del seguiment",
  segment_gap: "Diferència entre grups",
};

const QUADRANT: Record<string, string> = {
  act_first: "Actua primer",
  maintain: "Mantén",
  monitor: "Vigila",
  low_priority: "Prioritat baixa",
};

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${f1(Math.abs(v))}`;
const pct = (v: number) => `${Math.round(v)}%`;

function where(l: { collective: string; shift: string | null; domain: string | null }) {
  return [l.domain, l.collective === "All" ? "Tota l'empresa" : l.collective, l.shift ? tornLabel(l.shift) : null].filter(Boolean).join(" · ");
}

function Body({ i }: { i: InsightView }) {
  if (!i.detail) return null;
  switch (i.kind) {
    case "domain_state": {
      const d = i.detail;
      return (
        <p>
          Puntuació <span className="num font-semibold">{f1(d.current.score)}</span>/10
          {d.delta !== null && <> ({signed(d.delta)} vs. període anterior)</>} · confiança {pct(d.current.confidence)} · consens {pct(d.current.consensus)}
        </p>
      );
    }
    case "top_mover": {
      const d = i.detail;
      return (
        <p>
          {d.direction === "up" ? "↑ Puja" : "↓ Baixa"} <span className="num font-semibold">{signed(d.delta)}</span>: de {f1(d.previous.score)} a {f1(d.current.score)}
        </p>
      );
    }
    case "polarisation": {
      const d = i.detail;
      return (
        <p>
          El consens baixa {Math.round(d.consensusDrop)} punts (ara {pct(d.current.consensus)}) amb la puntuació en {f1(d.current.score)} ({signed(d.scoreDelta)}): les opinions s&apos;allunyen.
        </p>
      );
    }
    case "importance_gap": {
      const d = i.detail;
      return (
        <p>
          Importància {pct(d.importance * 100)} · puntuació {f1(d.score)}/10 · <span className="badge">{QUADRANT[d.quadrant] ?? d.quadrant}</span>
        </p>
      );
    }
    case "trajectory_mix": {
      const d = i.detail;
      return (
        <p>
          <span className="num">{pct(d.improving)}</span> milloren · <span className="num">{pct(d.stable)}</span> estables · <span className="num">{pct(d.declining)}</span> empitjoren
          <span className="text-subtle"> (últims {d.windowDays} dies)</span>
        </p>
      );
    }
    case "followup_confirmation": {
      const d = i.detail;
      return (
        <p>
          El seguiment confirma el senyal en <span className="num font-semibold">{pct(d.rate)}</span> dels casos ({d.confirmed} de {d.resolved}).
        </p>
      );
    }
    case "segment_gap": {
      const d = i.detail;
      return d.dimension === "shift" ? (
        <p>
          Diferència de <span className="num font-semibold">{f1(d.gap)}</span> entre torns: {fixShifts(d.lowest.label ?? "—")} {f1(d.lowest.score)} · {fixShifts(d.highest.label ?? "—")} {f1(d.highest.score)}
        </p>
      ) : (
        <p>
          Responsables {f1(d.managers.score)} · resta {f1(d.others.score)} (diferència {f1(d.gap)}).
        </p>
      );
    }
    default:
      return null;
  }
}

export function InsightCards({ insights, empty }: { insights: InsightView[]; empty: string }) {
  const visible = insights.filter((i) => !i.suppressed && i.detail && KIND_TITLE[i.kind]);
  if (visible.length === 0) return <p className="text-[13px] text-subtle">{empty}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {visible.map((i) => {
        const labels = (i.detail as { labels: { collective: string; shift: string | null; domain: string | null } }).labels;
        return (
          <li key={i.id} className="rounded-lg border border-line p-3 text-[13px]">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="badge">{KIND_TITLE[i.kind]}</span>
              <span className="num ml-auto text-xs text-subtle"><People n={i.n} scoped={i.collectiuId !== null || i.tornId !== null} /></span>
            </div>
            <div className="mb-1 text-xs text-subtle">{where(labels)}</div>
            <Body i={i} />
          </li>
        );
      })}
    </ul>
  );
}
