// Deterministic quality rules for drafted questions. Used by the repair loop in draftSurvey and by the eval.
import { estimateSeconds, type DraftQuestion, type NeedInput } from "./types";
import { violatesExclusions } from "./exclusions";

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// Spanish / English tells that must never appear in Catalan output.
export const NOT_CATALAN: RegExp[] = [
  /[ñ¿¡]/i,
  /\b(usted|ustedes|tienes|tiene|cómo|cuál|cuánto|trabajo|equipo|jefe|sueldo|puesto|estás|está|siente|sientes|contento|crees|piensas|y el|los|las|del equipo|cansancio|trabajas|sientas|mejorar|ambiente|nuevo|nueva|nuevos|horario|horarios|turnos|quando|donde|cuando|porque|lo anterior|mejora|compañeros|encuesta|gracias|respuestas)\b/i,
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

// Frequent Catalan mistakes seen in drafts (wrong contraction, Valencian or invented forms, calques).
export const CATALAN_ERRORS: { re: RegExp; fix: string }[] = [
  { re: /\b(al|del|pel) (?!i[aeou]|u[aeio]|h)[aeiouàèéíòóú]\w+/i, fix: `contracció incorrecta davant de vocal: "a l'equip", "de l'entorn", "per l'esforç"` },
  { re: /\b(aport|mesur|retroalimentació|impli|opin)\b/i, fix: `paraula incompleta o inventada (aportació, mesura, valoració, opinió, comunicació)` },
  { re: /\btevens\b|\ba nivell de\b|\bde cara a\b|\bun cop més\b|\bdonat que\b/i, fix: `expressió poc natural; usa una formulació més simple` },
  { re: /\b(teues|teua|meues|meua|seues|seua)\b/i, fix: `forma valenciana; usa teva/teves` },
  { re: /\bte sents\b|\bsentis\b|\bt'sents\b/i, fix: `"et sents"` },
  { re: /\ben quin (mesura|grau de)\b|\ben quina grau\b/i, fix: `"en quina mesura" o "en quin grau"` },
  { re: /\b\w+\/(a|da|essa)\b|\b\w+\(a\)|\bel\/la\b/i, fix: `sense barres de gènere; usa una redacció neutra` },
];
export const catalanErrorsIn = (t: string): string[] => CATALAN_ERRORS.filter((e) => e.re.test(t)).map((e) => e.fix);

// Gendered adjectives/participles when the speaker is "tu": masculine/feminine forms.
const MASC = "satisfet|motivat|valorat|orgullós|content|cansat|reconegut|escoltat|informat|integrat|recolzat|estressat|respectat|compromès|acceptat|cuidat|apreciat|ajudat|protegit|identificat|implicat|preparat|descansat|ben tractat|tranquil|benvingut|animat|sobrecarregat|exhaust|desmotivat|inclòs|conegut|vist";
const FEM = "satisfeta|motivada|valorada|orgullosa|contenta|cansada|reconeguda|escoltada|informada|integrada|recolzada|estressada|respectada|compromesa|acceptada|cuidada|apreciada|ajudada|protegida|identificada|implicada|preparada|descansada|ben tractada|tranquil·la|benvinguda|animada|sobrecarregada|exhausta|desmotivada|inclosa|coneguda|vista";
const MASC_RE = new RegExp(`\\b(${MASC})\\b`, "i");
const FEM_RE = new RegExp(`\\b(${FEM})\\b`, "i");
/** Gendered self-description forms in the text, as a list of "m"/"f" marks. */
export const genderedIn = (t: string): ("m" | "f")[] => [MASC_RE.test(t) ? "m" : null, FEM_RE.test(t) ? "f" : null].filter(Boolean) as ("m" | "f")[];
/** True when a set of texts mixes masculine and feminine self-description (or uses any, which excludes neutral wording). */
export const genderMixIn = (texts: string[]): boolean => {
  const all = new Set(texts.flatMap(genderedIn));
  return all.has("m") && all.has("f");
};

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
    const errs = catalanErrorsIn(`${q.text} ${q.low ?? ""} ${q.high ?? ""}`);
    if (errs.length) out.push(`${label(i)}: català incorrecte (${errs[0]}).`);
    if (genderedIn(q.text).length) out.push(`${label(i)}: usa una redacció neutra en gènere (per exemple "et sents part de...", "tens ganes de...", "se't valora"), sense satisfet/satisfeta, motivat/motivada, valorat/valorada, etc.`);
    if (identifyingIn(q.text)) out.push(`${label(i)}: pregunta dades personals o permet identificar algú. Elimina-la o canvia-la per una pregunta sobre l'experiència.`);
    if (leadingIn(q.text)) out.push(`${label(i)}: és tendenciosa o carregada. Reformula-la de manera neutra.`);
    if (violatesExclusions(q.text, need.exclusions) || violatesExclusions(q.reason, need.exclusions)) out.push(`${label(i)}: toca un tema exclòs ("${need.exclusions}").`);
    const t = q.text.trim();
    if ((q.type === "scale5" || q.type === "scale10") && /^(per què|què|quin|quina|quins|quines|on|qui|quan)\b/i.test(t)) out.push(`${label(i)}: és de tipus escala però demana una resposta oberta. Usa "open" o reformula-la com a valoració.`);
    if (q.type === "yes_no" && WH.test(t) && !YN_STARTS.test(t)) out.push(`${label(i)}: és sí/no però no es pot respondre amb sí o no.`);
    const w = words(q.text).length;
    if (w > wordLimit(need.collective) + 3) out.push(`${label(i)}: massa llarga (${w} paraules, màxim ${wordLimit(need.collective)}).`);
  });
  for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) if (norm(qs[i].text) === norm(qs[j].text) || jaccard(qs[i].text, qs[j].text) >= 0.5) out.push(`Les preguntes ${i + 1} i ${j + 1} es repeteixen. Fes-les diferents.`);
  return out;
}

type Kind = "freq" | "agree" | "quality" | "prob" | "degree";
const stemKind = (text: string): Kind => {
  const t = norm(text);
  if (/\bamb quina freq|\bsovint|\bquantes vegades|\bcada (dia|setmana|torn)\b/.test(t)) return "freq";
  if (/d'acord|\b(creus|penses|consideres|trobes|diries) que\b/.test(t)) return "agree";
  if (/recomanar|recomanaries/.test(t)) return "prob";
  if (/^(com|quina valoraci|valores)|\bvalores\b|\bcom (et )?(sents|trobes|valores|va|és|són)\b/.test(t) && !/fins a quin punt|\bquant\b|en quina mesura|en quin grau/.test(t)) return "quality";
  return "degree";
};
const labelKind = (low: string, high: string): Kind => {
  const l = norm(`${low} ${high}`);
  if (/\bmai\b|\bsempre\b|\bsovint\b|\bvegades\b|\bgaireb/.test(l)) return "freq";
  if (/d'acord/.test(l)) return "agree";
  if (/probable/.test(l)) return "prob";
  if (/malament|\bbe\b|\bmal\b|\bdolent|\bbo\b|\bbona\b|\bsatisf|\binsatisf/.test(l)) return "quality";
  return "degree";
};
const ANCHORS: Record<Kind, { low: string; high: string }> = {
  freq: { low: "Mai", high: "Sempre" },
  agree: { low: "Gens d'acord", high: "Totalment d'acord" },
  prob: { low: "Gens probable", high: "Molt probable" },
  quality: { low: "Molt malament", high: "Molt bé" },
  degree: { low: "Gens", high: "Molt" },
};

/** End labels that match the question's wording: agreement, frequency, probability, quality or degree. */
export function anchorsFor(text: string): { low: string; high: string } {
  const t = norm(text);
  const k = stemKind(text);
  if (k === "degree" && /\b(tens|tenen|rebs|reps|disposes|hi ha)\b/.test(t) && /(prou|suficient)/.test(t)) return { low: "Gens", high: "Del tot" };
  return ANCHORS[k];
}

/** True when the model's end labels do not fit the stem (e.g. "Gens..Sempre", agreement labels on a frequency question, "Del tot" on "fins a quin punt"). */
export function anchorsClash(text: string, low?: string, high?: string): boolean {
  if (!low || !high) return true;
  if (stemKind(text) !== labelKind(low, high)) return true;
  const t = norm(text);
  if (/fins a quin punt|en quina mesura|en quin grau/.test(t) && /^del tot/.test(norm(high))) return true;
  if (/^(gens|molt)\b/.test(norm(low)) && /^sempre/.test(norm(high))) return true;
  return false;
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

