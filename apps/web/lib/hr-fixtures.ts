// Placeholder data until the analysis jobs fill the aggregate tables.
// Replace with reads from the HR repository; shapes come from @damm/shared.
import type { Agregat, Recomanacio, Senyal } from "@damm/shared";
import { isSuppressed } from "@damm/shared";

export const draftQuestions = [
  { id: 1, domini: "Condicions i organització", tipus: "escala5", text: "El sistema de torns es comunica amb prou antelació?" },
  { id: 2, domini: "Benestar", tipus: "escala5", text: "Les pauses durant el torn són suficients?" },
  { id: 3, domini: "Cultura i pertinença", tipus: "obert", text: "Què canviaries del sistema de torns?" },
];


export const aggregates: Agregat[] = [
  { periode: "2026-10", collectiuId: 1, tornId: 1, dominiId: 1, n: 64, mitjana: 3.6, suprimit: false },
  { periode: "2026-10", collectiuId: 1, tornId: 3, dominiId: 1, n: 12, mitjana: 2.9, suprimit: false },
  { periode: "2026-10", collectiuId: 2, tornId: 3, dominiId: 1, n: 6, mitjana: null, suprimit: isSuppressed(6) },
];

export const signals: Senyal[] = [
  { id: 1, tipus: "emergent", descripcio: "Comunicació del sistema de torns i pauses", collectiuId: 1, periode: "2026-10", n: 31, confianca: 0.8, suprimit: false },
  { id: 2, tipus: "feble", descripcio: "Equips de seguretat i calor", collectiuId: 2, periode: "2026-10", n: 12, confianca: 0.55, suprimit: false },
];

export const recommendations: Recomanacio[] = [
  { id: 1, senyalId: 1, text: "Publicar els torns amb 15 dies d'antelació i enquesta de seguiment.", estat: "proposada", seguimentNecessitatId: null },
];
