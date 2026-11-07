// Hidden ground-truth themes for the synthetic comments. Shared by the comment generator and the seed.
export interface ThemeDef {
  id: string;
  label: string;
  domini: string | null; // preferred domain of the question the comment is attached to
  count: number; // comments of this theme in comments.json
  kind: "general" | "emergent" | "feble";
}

export const THEMES: ThemeDef[] = [
  { id: "carrega_treball", label: "Càrrega de treball", domini: "Benestar", count: 37, kind: "general" },
  { id: "cansament_descans", label: "Cansament i descans", domini: "Benestar", count: 37, kind: "general" },
  { id: "relacio_cap", label: "Relació amb el cap directe", domini: "Lideratge", count: 37, kind: "general" },
  { id: "direccio_visio", label: "Direcció i visió de futur", domini: "Lideratge", count: 37, kind: "general" },
  { id: "formacio", label: "Formació", domini: "Desenvolupament", count: 37, kind: "general" },
  { id: "carrera_promocio", label: "Carrera i promoció", domini: "Desenvolupament", count: 37, kind: "general" },
  { id: "reconeixement", label: "Reconeixement", domini: "Cultura i pertinença", count: 37, kind: "general" },
  { id: "comunicacio_interna", label: "Comunicació interna", domini: "Cultura i pertinença", count: 37, kind: "general" },
  { id: "ambient_equip", label: "Ambient d'equip", domini: "Entorn i relacions", count: 37, kind: "general" },
  { id: "col_laboracio", label: "Col·laboració entre departaments", domini: "Entorn i relacions", count: 37, kind: "general" },
  { id: "eines_sistemes", label: "Eines i sistemes", domini: "Condicions i organització", count: 35, kind: "general" },
  { id: "conciliacio_horaris", label: "Conciliació i horaris", domini: "Condicions i organització", count: 35, kind: "general" },
  // October emerging theme in Fàbriques
  { id: "torns_comunicacio_pauses", label: "Comunicació del sistema de torns i pauses", domini: "Condicions i organització", count: 46, kind: "emergent" },
  // Weak signal in Logística: few but consistent mentions
  { id: "seguretat_calor_epi", label: "Calor i equips de protecció (EPI)", domini: "Benestar", count: 14, kind: "feble" },
];

export const TOTAL_COMMENTS = THEMES.reduce((s, t) => s + t.count, 0); // 500
