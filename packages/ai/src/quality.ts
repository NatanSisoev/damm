// Deterministic quality rules for drafted questions. Used by the repair loop in draftSurvey and by the eval.
import { estimateSeconds, type DraftQuestion, type NeedInput } from "./types";
import { violatesExclusions } from "./exclusions";

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// Spanish / English tells that must never appear in Catalan output.
export const NOT_CATALAN: RegExp[] = [
  /[ñ¿¡]/i,
  /\b(usted|ustedes|tienes|tiene|cómo|cuál|cuánto|trabajo|equipo|jefe|sueldo|puesto|estás|está|siente|sientes|contento|crees|piensas|y el|los|las|del equipo|cansancio|trabajas|sientas|mejorar|empresa|ambiente|compañeros|encuesta|gracias|respuestas)\b/i,
  /\b(the|you|your|how|do you|are you|work|team|feel|boss|manager's|please|safe at|is there|thanks|survey)\b/i,
  /\b(muy|mucho|siempre|nunca|bastante|también|pero)\b/i,
  /\btreballas\b|\bsents-te\b|\bcom estás\b/i,
];

// Questions that identify or profile a person (demographics, exact role/team, names).
export const IDENTIFYING: RegExp[] = [
  /\bedat\b|\banys tens\b|\bquants anys\b|\bany de naixement\b|\bnaixement\b/i,
  /\bg[eè]nere\b|\bsexe\b|\bhome o dona\b|\borientaci[óo]\b/i,
  /\bnacionalitat\b|\borigen\b|\breligi[óo]\b|\bpartit pol[ií]tic\b|\bvotes?\b|\bideologia\b/i,
  /\bantiguitat\b|\bquant(s)? (de )?temps (fa que )?(treballes|portes)\b|\bquants anys (fa que )?(treballes|portes)\b/i,
  /\bnom (i cognoms|del teu|de la persona)\b|\bcognoms\b|\bdni\b|\bn[úu]mero d'empleat\b|\bcorreu\b|\btel[èe]fon\b/i,
  /\bqui [ée]s el teu (cap|responsable|superior)\b|\bnom del teu (cap|responsable|superior)\b|\bquin [ée]s el teu (cap|responsable)\b/i,
  /\bquin torn (fas|tens|treballes)\b|\ben quin torn (treballes|estàs)\b|\bquin equip (exacte|concret)\b|\bde quin (equip|departament|torn|centre|magatzem|l[ií]nia)\b|\bquina l[ií]nia\b|\bquin departament\b|\bquin magatzem\b/i,
  /\bdiagn[oò]stic\b|\bmalaltia\b|\bmedicaci[óo]\b|\bembar[àa]s\b/i,
  /\bnomina\b|\bsou exacte\b|\bquant cobres\b/i,
];

// Leading / loaded wording.
export const LEADING: RegExp[] = [
  /\bno (creus|trobes|penses|et sembla|t'agrada|t'agradaria) (que|molt)?\b/i,
  /\boi que\b|\bveritat que\b|\bestàs d'acord que\b/i,
  /\b(fantàstic|fantàstica|increïble|excel·lent|magnífic|perfecte|genial|horrible|terrible|pèssim|deplorable)\b/i,
  /\bcom d'(increïble|excel·lent|genial|fantàstic)\b/i,
  /\bmolt (bo|bona|millor|pitjor|dolent|dolenta)\b/i,
  /\bencantat|encantada\b/i,
  /\bpel teu cap tan\b/i,
];

export const WH = /^(com|quant|quants|quanta|quantes|què|que|per què|quin|quina|quins|quines|quan|on|qui|de quina manera|en quins)\b/i;
export const YN_STARTS = /^(has|han|hi ha|tens|tenen|t'|et |us |saps|sap |pots|poden|podries|creus|trobes|consideres|veus|sents|rebs|reps|coneixes|coneix|estàs|estan|ets|és|són|l'|la |el |els |les |aquest|aquesta|s'|se |si |fas|fan|disposes|disposeu|acostumes|vols|voldries|participes|hauria|ha |vas|van)/i;

export const leadingIn = (t: string) => LEADING.some((r) => r.test(t));
export const identifyingIn = (t: string) => IDENTIFYING.some((r) => r.test(t));
export const notCatalanIn = (t: string) => NOT_CATALAN.some((r) => r.test(t));

export function jaccard(a: string, b: string): number {
  const sa = new Set(norm(a).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const sb = new Set(norm(b).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

const isShortTone = (c?: string | null) => c === "Fàbriques" || c === "Logística";
export const wordLimit = (collective?: string | null) => (isShortTone(collective) ? 12 : 20);
export const maxOpen = (collective?: string | null) => (isShortTone(collective) ? 1 : 2);

/** Plain-language problems the model must fix (Catalan, one per line). Empty = clean. */
export function findProblems(need: NeedInput, s: { title: string; intro: string; questions: DraftQuestion[] }): string[] {
  const out: string[] = [];
  const qs = s.questions;
  const label = (i: number) => `Pregunta ${i + 1} ("${qs[i].text.slice(0, 50)}")`;
  for (const t of [s.title, s.intro]) if (notCatalanIn(t) || identifyingIn(t)) out.push(`El títol o la introducció no són en català correcte o demanen dades personals: "${t.slice(0, 60)}".`);
  qs.forEach((q, i) => {
    if ([q.text, q.reason, q.low ?? "", q.high ?? ""].some(notCatalanIn)) out.push(`${label(i)}: no està en català (hi ha castellà o anglès).`);
    if (identifyingIn(q.text)) out.push(`${label(i)}: pregunta dades personals o permet identificar algú. Elimina-la o canvia-la per una pregunta sobre l'experiència.`);
    if (leadingIn(q.text)) out.push(`${label(i)}: és tendenciosa o carregada. Reformula-la de manera neutra.`);
    if (violatesExclusions(q.text, need.exclusions) || violatesExclusions(q.reason, need.exclusions)) out.push(`${label(i)}: toca un tema exclòs ("${need.exclusions}").`);
    const t = q.text.trim();
    if ((q.type === "scale5" || q.type === "scale10") && /^(per què|què|quin|quina|quins|quines|on|qui|quan)\b/i.test(t)) out.push(`${label(i)}: és de tipus escala però demana una resposta oberta. Usa "open" o reformula-la com a valoració.`);
    if (q.type === "yes_no" && WH.test(t) && !YN_STARTS.test(t)) out.push(`${label(i)}: és sí/no però no es pot respondre amb sí o no.`);
    if (q.type === "scale5" || q.type === "scale10") {
      if (!q.low || !q.high) out.push(`${label(i)}: falten "low" i "high" (etiquetes dels extrems, 1-3 paraules).`);
      else if (words(q.low).length > 4 || words(q.high).length > 4 || norm(q.low) === norm(q.high)) out.push(`${label(i)}: les etiquetes dels extrems han de ser diferents i d'1 a 3 paraules.`);
    }
    const w = words(q.text).length;
    if (w > wordLimit(need.collective) + 3) out.push(`${label(i)}: massa llarga (${w} paraules, màxim ${wordLimit(need.collective)}).`);
  });
  for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) if (norm(qs[i].text) === norm(qs[j].text) || jaccard(qs[i].text, qs[j].text) >= 0.5) out.push(`Les preguntes ${i + 1} i ${j + 1} es repeteixen. Fes-les diferents.`);
  const opens = qs.filter((q) => q.type === "open").length;
  if (opens > maxOpen(need.collective)) out.push(`Hi ha ${opens} preguntes obertes, màxim ${maxOpen(need.collective)}.`);
  const secs = estimateSeconds(qs.map((q) => q.type));
  if (need.maxSeconds && secs > need.maxSeconds && qs.length > 3) out.push(`Triga ${secs} s i el màxim és ${need.maxSeconds} s: treu preguntes o canvia obertes per escales.`);
  return out;
}

/** Generic end labels for a scale question, picked from its wording. Last resort when the model omits them. */
export function anchorsFor(text: string): { low: string; high: string } {
  const t = norm(text);
  if (/\b(tens|rebs|reps|disposes|hi ha|et donen|t'expliquen|et fan)\b/.test(t) && /(prou|suficient|temps|material|equip|eina|informaci|formaci)/.test(t)) return { low: "Gens", high: "Del tot" };
  if (/\bamb quina freq|\bsovint|\bsol\b|\bcada\b/.test(t)) return { low: "Mai", high: "Sempre" };
  if (/recomanar|recomanaries/.test(t)) return { low: "Gens probable", high: "Molt probable" };
  if (/d'acord|creus que|penses que/.test(t)) return { low: "Gens d'acord", high: "Totalment" };
  if (/(valores|com (et )?(sents|trobes|és|són|va))/.test(t)) return { low: "Molt malament", high: "Molt bé" };
  return { low: "Gens", high: "Molt" };
}

/** Drop questions until the survey fits maxSeconds (open ones first, then from the end), never below 3. */
export function trimToBudget(qs: DraftQuestion[], maxSeconds?: number | null): DraftQuestion[] {
  const out = [...qs];
  if (!maxSeconds) return out;
  while (out.length > 3 && estimateSeconds(out.map((q) => q.type)) > maxSeconds) {
    let idx = -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].type === "open") { idx = i; break; }
    out.splice(idx >= 0 ? idx : out.length - 1, 1);
  }
  return out;
}
