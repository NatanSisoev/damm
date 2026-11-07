// Catalan sentences for engine alarms, built from type and fields (the engine's `description` is English).
// Numbers that only exist inside that description (score series on the engine's 0-10 scale) are parsed out of it.
import type { AlarmView } from "@/lib/hr-engine";

export const NON_ACTIONABLE = new Set(["low_confidence", "improvement"]);

const num = (x: number) => x.toFixed(1).replace(".", ",");

/** Score values written as "6.1 → 5.9 → 5.7" in the description. */
export function parseSeries(description: string): number[] {
  const m = description.match(/\(([\d.]+(?:\s*→\s*[\d.]+)+)\)/);
  return m ? m[1].split("→").map((v) => Number(v.trim())).filter(Number.isFinite) : [];
}

/** Size of the drop in score points, 0 when the description gives no figures. */
export function dropSize(a: Pick<AlarmView, "description">): number {
  const s = parseSeries(a.description);
  if (s.length >= 2) return Math.max(0, s[0] - s[s.length - 1]);
  const m = a.description.match(/of ([\d.]+) points?/);
  return m ? Number(m[1]) : 0;
}

/** Predicate that follows "{Segment} · {Domini}:". */
export function alarmPredicate(a: Pick<AlarmView, "type" | "description">): string {
  const s = parseSeries(a.description);
  const series = s.length ? ` (${s.map(num).join(" → ")})` : "";
  const m = a.description.match(/of ([\d.]+) points? over (\d+) periods?/);
  switch (a.type) {
    case "sustained_decline":
      return `ha baixat ${s.length || 3} períodes seguits${series}`;
    case "sharp_drop":
      return `ha caigut de cop respecte del període anterior${series}`;
    case "feble":
      return m ? `baixa poc a poc: −${num(Number(m[1]))} punts en ${m[2]} períodes` : "mostra un descens lent però constant";
    case "polarisation":
      return "té opinions molt polaritzades dins del grup";
    case "changepoint_cluster":
      return "acumula canvis de tendència en poc temps";
    case "emergent":
      return "té un tema emergent als comentaris";
    case "baixa_participacio":
      return "té una participació baixa";
    case "improvement":
      return `ha millorat${series}`;
    case "low_confidence":
      return "encara té poques dades per fiar-se'n";
    default:
      return a.description;
  }
}

/** Why a person should care / what to look at next. */
export function alarmHint(type: string): string {
  switch (type) {
    case "sustained_decline": return "Un descens que es manté no es corregeix sol: convé entendre'n la causa.";
    case "sharp_drop": return "Un canvi brusc sol tenir una causa concreta; comprova què ha passat aquest període.";
    case "feble": return "Encara és poc, però va en una sola direcció.";
    case "polarisation": return "La mitjana amaga dos grups que viuen coses diferents.";
    case "changepoint_cluster": return "Pot indicar un esdeveniment que afecta diversos àmbits alhora.";
    case "emergent": return "Tema nou als comentaris: mira què diuen.";
    case "baixa_participacio": return "Amb poca participació els resultats poden no representar el grup.";
    default: return "";
  }
}
