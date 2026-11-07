// Alarm groupings and hints. The Catalan sentence itself comes from lib/signal-text.ts.

export const NON_ACTIONABLE = new Set(["low_confidence", "improvement"]);

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
