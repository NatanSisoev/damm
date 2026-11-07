// Deterministic template used when the LLM is unavailable, so the demo never breaks.
import type { Domini } from "@damm/shared";
import { violatesExclusions } from "./exclusions";
import { anchorsFor } from "./quality";
import type { DraftQuestion, DraftType, NeedInput } from "./types";

type T = { text: string; type: DraftType; domain: Domini; reason: string };

export const SHORT_TONE = ["Fàbriques", "Logística"];
export const isShortTone = (collective?: string | null) => !!collective && SHORT_TONE.includes(collective);

const SHIFTS: T[] = [
  { text: "T'han explicat amb prou temps el canvi de torns?", type: "scale5", domain: "Entorn i relacions", reason: "Mesura si la comunicació del canvi ha arribat a temps." },
  { text: "Tens prou pauses durant el torn?", type: "scale5", domain: "Condicions i organització", reason: "Les pauses són la dificultat més citada amb un sistema de torns nou." },
  { text: "Has entès bé com funciona el nou sistema de torns?", type: "yes_no", domain: "Cultura i pertinença", reason: "Comprova la comprensió abans de buscar causes." },
  { text: "Què és el que més t'ha costat del canvi de torns?", type: "open", domain: "Benestar", reason: "Una sola pregunta oberta recull dificultats que no hem previst." },
  { text: "Com valores el teu descans entre torns?", type: "scale5", domain: "Benestar", reason: "Detecta l'impacte en el descans." },
  { text: "Què reforçaries del sistema de torns?", type: "open", domain: "Condicions i organització", reason: "Convida a proposar millores concretes." },
];

const GENERIC: Record<Domini, T[]> = {
  Benestar: [
    { text: "Com et sents al final de la jornada?", type: "scale5", domain: "Benestar", reason: "Termòmetre ràpid del benestar." },
    { text: "Tens la sensació de poder desconnectar quan acabes?", type: "yes_no", domain: "Benestar", reason: "Mira si la feina envaeix el descans." },
  ],
  Lideratge: [
    { text: "Quan tens un dubte, el teu responsable t'ajuda?", type: "scale5", domain: "Lideratge", reason: "Mesura el suport directe del lideratge." },
    { text: "Se sol escoltar la teva opinió abans de decidir?", type: "yes_no", domain: "Lideratge", reason: "Mesura la participació en les decisions." },
  ],
  Desenvolupament: [
    { text: "Tens oportunitats d'aprendre coses noves a la feina?", type: "scale5", domain: "Desenvolupament", reason: "Mesura el creixement percebut." },
    { text: "Quina formació t'ajudaria més ara?", type: "open", domain: "Desenvolupament", reason: "Recull necessitats de formació concretes." },
  ],
  "Cultura i pertinença": [
    { text: "Et sents part de l'equip?", type: "scale5", domain: "Cultura i pertinença", reason: "Mesura la pertinença." },
    { text: "Recomanaries treballar aquí a una persona coneguda?", type: "scale10", domain: "Cultura i pertinença", reason: "Indicador de compromís amb l'empresa." },
  ],
  "Entorn i relacions": [
    { text: "Rebs la informació que necessites de l'empresa a temps?", type: "scale5", domain: "Entorn i relacions", reason: "Mesura la qualitat de la comunicació interna." },
    { text: "Com és la relació amb els teus companys?", type: "scale5", domain: "Entorn i relacions", reason: "Mesura el clima entre companys." },
  ],
  "Condicions i organització": [
    { text: "Tens les eines i el material que necessites per fer bé la feina?", type: "scale5", domain: "Condicions i organització", reason: "Mesura les condicions materials." },
    { text: "Com valores l'organització del teu dia a dia?", type: "scale5", domain: "Condicions i organització", reason: "Mesura l'organització del treball." },
    { text: "Què canviaries per treballar millor?", type: "open", domain: "Condicions i organització", reason: "Una pregunta oberta per detectar millores." },
  ],
};

const KEYWORDS: [Domini, RegExp][] = [
  ["Condicions i organització", /torn|horari|pausa|material|eina|calor|seguretat|organitz|c[àa]rrega|equip de protecci/i],
  ["Entorn i relacions", /comunic|informa|compan|relaci|canvi/i],
  ["Lideratge", /\bcap\b|responsable|l[ií]der|manager|supervisor|directiu/i],
  ["Desenvolupament", /formaci|carrera|aprendre|promoci|desenvolup/i],
  ["Cultura i pertinença", /cultura|valors|orgull|pertinen|compromis/i],
  ["Benestar", /estr[eè]s|cansament|benestar|salut|descans|son\b/i],
];
const ORDER: Domini[] = ["Condicions i organització", "Entorn i relacions", "Benestar", "Lideratge", "Desenvolupament", "Cultura i pertinença"];

function pickDomains(text: string): Domini[] {
  const scored = KEYWORDS.map(([d, re]) => [d, (text.match(new RegExp(re.source, "gi")) ?? []).length] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);
  return [...scored, ...ORDER.filter((d) => !scored.includes(d))];
}

function titleOf(objective: string): string {
  const first = objective.split(/[.!?\n]/)[0].trim().replace(/^(vull|volem|necessito|necessitem)\s+(saber|entendre|conèixer)\s+/i, "");
  const t = first.charAt(0).toUpperCase() + first.slice(1);
  return t.length > 80 ? t.slice(0, 77).trimEnd() + "…" : t;
}

function withAnchors(t: T): DraftQuestion {
  return t.type === "scale5" || t.type === "scale10" ? { ...t, ...anchorsFor(t.text) } : { ...t };
}

export function fallbackQuestions(need: NeedInput, exclude: string[] = []): DraftQuestion[] {
  const short = isShortTone(need.collective);
  const corpus = `${need.objective} ${need.context ?? ""}`;
  const pool: T[] = /torn/i.test(corpus) ? [...SHIFTS] : [];
  for (const d of pickDomains(corpus)) pool.push(...GENERIC[d]);
  const seen = new Set(exclude);
  const target = short ? 4 : 5;
  const maxOpen = short ? 1 : 2;
  const out: T[] = [];
  let opens = 0;
  for (const t of pool) {
    if (out.length >= target) break;
    if (seen.has(t.text) || violatesExclusions(t.text, need.exclusions)) continue;
    if (t.type === "open" && opens >= maxOpen) continue;
    if (t.type === "open") opens++;
    out.push(t);
    seen.add(t.text);
  }
  return out.map(withAnchors);
}

export function fallbackSurvey(need: NeedInput) {
  const short = isShortTone(need.collective);
  return {
    title: titleOf(need.objective),
    intro: short
      ? "Gràcies per dedicar-nos un minut. Són poques preguntes, i les respostes són anònimes."
      : "Gràcies per participar. Són unes poques preguntes i les respostes són anònimes: només veiem resultats de grups.",
    questions: fallbackQuestions(need),
  };
}

/** One replacement question for the fallback path: a template not used yet, same domain first. */
export function fallbackReplacement(need: NeedInput, current: DraftQuestion, others: DraftQuestion[]): DraftQuestion | null {
  const used = [current.text, ...others.map((o) => o.text)];
  const pool = [...(/torn/i.test(`${need.objective} ${need.context ?? ""}`) ? SHIFTS : []), ...GENERIC[current.domain], ...Object.values(GENERIC).flat()];
  const sameType = (t: T) => t.type === current.type;
  const ok = (t: T) => !used.includes(t.text) && !violatesExclusions(t.text, need.exclusions);
  const f = pool.find((t) => ok(t) && t.domain === current.domain && sameType(t)) ?? pool.find((t) => ok(t) && sameType(t)) ?? pool.find(ok);
  return f ? withAnchors(f) : null;
}
