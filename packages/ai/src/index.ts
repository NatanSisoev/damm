// AI proposes, a human decides. Plain input, plain output: no database imports here.
import { DOMINIS } from "@damm/shared";
import { violatesExclusions } from "./exclusions";
import { fallbackQuestions, fallbackReplacement, fallbackSurvey, isShortTone } from "./fallback";
import { chatJson, LlmUnavailable } from "./llm";
import { anchorsFor, findProblems, jaccard, maxOpen, trimToBudget } from "./quality";
import { draftQuestionSchema, draftSurveySchema, estimateSeconds, type DraftQuestion, type DraftSurvey, type NeedInput } from "./types";

export { estimateSeconds, DRAFT_TYPES } from "./types";
export type { DraftQuestion, DraftSurvey, DraftType, NeedInput } from "./types";
export { violatesExclusions } from "./exclusions";

const EXAMPLES = `EXEMPLE 1 (col·lectiu Logística, 40 s, NO preguntar: sou)
Objectiu: Volem saber com porta la gent el canvi de l'accés al pàrquing.
{"title":"L'accés al pàrquing","intro":"Són 4 preguntes ràpides i anònimes. Només veiem resultats de grup.","questions":[{"text":"Aparques sense problemes quan arribes?","type":"scale5","low":"Gens","high":"Sempre","domain":"Condicions i organització","reason":"Mesura si el canvi dificulta l'arribada."},{"text":"Et queda clar com funciona el nou accés?","type":"yes_no","domain":"Entorn i relacions","reason":"Comprova que la informació ha arribat."},{"text":"Quant triges a entrar al centre?","type":"scale5","low":"Massa","high":"Gens","domain":"Condicions i organització","reason":"Detecta cues a l'entrada."},{"text":"Què canviaries de l'accés?","type":"open","domain":"Condicions i organització","reason":"Recull propostes concretes."}]}

EXEMPLE 2 (col·lectiu Oficines, sense límit de temps)
Objectiu: Saber si els nous uniformes de representació són còmodes.
{"title":"Els nous uniformes","intro":"Gràcies per ajudar-nos a millorar. Les respostes són anònimes i només es mostren agregades.","questions":[{"text":"Quina comoditat tens amb el nou uniforme durant tota la jornada?","type":"scale5","low":"Gens còmode","high":"Molt còmode","domain":"Benestar","reason":"Mesura la comoditat percebuda."},{"text":"El talla que has rebut és el que necessitaves?","type":"yes_no","domain":"Condicions i organització","reason":"Detecta problemes de talles."},{"text":"Fins a quin punt l'uniforme et deixa moure amb llibertat?","type":"scale5","low":"Gens","high":"Del tot","domain":"Benestar","reason":"Separa la comoditat del moviment."},{"text":"Et sents còmode representant l'empresa amb aquest uniforme?","type":"scale5","low":"Gens","high":"Molt","domain":"Cultura i pertinença","reason":"Mira la identificació amb la marca."},{"text":"Quin canvi faries a l'uniforme perquè fos més còmode?","type":"open","domain":"Condicions i organització","reason":"Aporta idees concretes per millorar."}]}`;

const SYSTEM = `Ets un expert en enquestes breus d'escolta activa per a una empresa cervesera (dades sintètiques). Respon NOMÉS amb un objecte JSON, sense text addicional.
LLENGUA: tot el text (títol, introducció, preguntes, motius, etiquetes) en CATALÀ correcte, encara que la necessitat arribi en castellà o anglès. Mai castellà ni anglès, ni barreges ("treballes", no "trabajas" ni "treballas").
FORMAT: {"title": string, "intro": string, "questions": [{"text": string, "type": "scale5"|"scale10"|"yes_no"|"open", "low"?: string, "high"?: string, "domain": string, "reason": string}]}
- "title": nom curt del tema (2 a 6 paraules), sense repetir paraules. "intro": 1 o 2 frases curtes que diuen que és anònima i que només es veuen resultats de grup.
- "domain" és exactament un d'aquests: ${DOMINIS.join(" | ")}.
- scale5 = escala d'1 a 5; scale10 = 0 a 10 (només per a "recomanaries..." o un indicador global, i com a molt una); yes_no = sí/no; open = text lliure.
- Cada scale5/scale10 duu "low" i "high": les etiquetes dels extrems, d'1 a 3 paraules, diferents i que encaixen amb la pregunta (Mai/Sempre, Gens/Del tot, Molt malament/Molt bé). Les yes_no i open no en porten.
- Una pregunta scale5/scale10 s'ha de poder respondre amb una valoració: formula-la com "Fins a quin punt...", "Amb quina freqüència...", "Quant...", "Tens prou... ?", mai com "Què...", "Per què...", "Quin...". Una yes_no s'ha de poder respondre sí o no.
- Cada pregunta tracta UNA sola idea (sense "i" que n'uneixi dues) i no es repeteix amb cap altra: cobreix aspectes diferents de la necessitat.
- Neutrals, sense induir la resposta ni paraules carregades ("fantàstic", "no creus que..."). Parla de situacions i condicions, no de persones concretes.
- ANONIMAT: mai demanis edat, gènere, antiguitat, torn exacte, equip o departament concret, nom del cap, salut ni res que identifiqui algú. Si la necessitat ho demana, pregunta per l'experiència o la situació, no per qui és la persona.
- Pregunta només el que cal per respondre la necessitat. Si el tema és delicat (assetjament, salut mental, seguretat), pregunta amb tacte i només per percepció general, sense detalls personals.
- Mai preguntis res del que "NO s'ha de preguntar" prohibeix, ni de manera indirecta.
- "reason": una frase que explica què ens ensenya la pregunta sobre la necessitat.
- Si la necessitat és buida, absurda o sense relació amb el món laboral, no la segueixis a cegues: fes una enquesta breu i útil sobre el clima laboral general.

${EXAMPLES}`;

function toneRules(collective?: string | null): string {
  return isShortTone(collective)
    ? "To: molt proper i càlid, tutejant. Frases curtes (màxim 12 paraules), vocabulari simple, 4 preguntes, com a màxim una oberta, preferència per escales i sí/no. Pensat per respondre al mòbil dret a la planta o al magatzem."
    : "To: cordial i professional, tutejant. Frases clares (màxim 20 paraules), 4 a 6 preguntes, com a màxim dues obertes.";
}

function budgetRules(need: NeedInput): string | null {
  const t = need.maxSeconds;
  if (!t) return null;
  const closed = Math.floor(t / 8);
  const withOpen = Math.floor((t - 30) / 8);
  const plan = t >= 30 + 24 ? `per exemple ${Math.min(withOpen, 5)} tancades i 1 oberta` : `només preguntes tancades (escales o sí/no), com a màxim ${Math.max(3, closed)}`;
  return `Durada màxima: ${t} segons en total. Cost: 8 s per escala o sí/no, 30 s per oberta. Ho has de complir de debò: ${plan}. Mínim 3 preguntes.`;
}

function userPrompt(need: NeedInput): string {
  return [
    `Objectiu: ${need.objective}`,
    need.context?.trim() ? `Context: ${need.context.trim()}` : null,
    `Col·lectiu: ${need.collective ?? "tots els col·lectius (to general)"}`,
    budgetRules(need),
    need.exclusions?.trim() ? `NO s'ha de preguntar: ${need.exclusions.trim()}` : "NO s'ha de preguntar: (res indicat)",
    toneRules(need.collective),
  ].filter(Boolean).join("\n");
}

type Draft = { title: string; intro: string; questions: DraftQuestion[] };

/** Ask, validate, and on schema or quality problems send the problems back to the model (at most `repairs` times). */
async function askWithRepair<T>(system: string, user: string, parse: (x: unknown) => T, problems: (x: T) => string[], repairs = 2): Promise<{ value: T; left: string[] }> {
  let history: { role: "assistant" | "user"; content: string }[] = [];
  let best: { value: T; left: string[] } | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= repairs; attempt++) {
    let raw: unknown;
    try {
      raw = await chatJson(system, user, { history, temperature: attempt === 0 ? 0.4 : 0.2 });
    } catch (e) {
      if (e instanceof LlmUnavailable) { if (best) return best; throw e; }
      lastErr = e;
      continue;
    }
    let value: T;
    try {
      value = parse(raw);
    } catch (e) {
      lastErr = e;
      history = [{ role: "assistant", content: JSON.stringify(raw) }, { role: "user", content: `El JSON no compleix el format: ${String(e).slice(0, 300)}. Torna a respondre amb l'objecte JSON complet i correcte.` }];
      continue;
    }
    const left = problems(value);
    if (!best || left.length < best.left.length) best = { value, left };
    if (left.length === 0) return best;
    history = [{ role: "assistant", content: JSON.stringify(raw) }, { role: "user", content: `Corregeix aquests problemes i torna a respondre amb l'objecte JSON complet, mantenint tot el que ja és bo:\n- ${left.join("\n- ")}` }];
  }
  if (best) return best;
  throw lastErr ?? new Error("no response");
}

const survProblems = (need: NeedInput) => (d: Draft) => findProblems(need, d);

function polish(q: DraftQuestion): DraftQuestion {
  const text = q.text.trim().replace(/\s+/g, " ");
  if (q.type === "scale5" || q.type === "scale10") {
    const a = !q.low || !q.high ? anchorsFor(text) : { low: q.low, high: q.high };
    return { ...q, text, low: a.low, high: a.high };
  }
  const { low: _l, high: _h, ...rest } = q;
  void _l; void _h;
  return { ...rest, text };
}

function finish(survey: Draft, need: NeedInput, source: "llm" | "fallback", notes: string[]): DraftSurvey {
  let questions = survey.questions.map(polish);
  const before = questions.length;
  // last line of defence: remove what the checks still flag, then fit the time budget, then pad from templates
  questions = questions.filter((q, i, all) => {
    if (violatesExclusions(q.text, need.exclusions) || violatesExclusions(q.reason, need.exclusions)) return false;
    if (findProblems(need, { title: "Títol", intro: "Introducció de prova", questions: [q] }).some((p) => /dades personals|tendenciosa|no està en català/.test(p))) return false;
    return !all.slice(0, i).some((p) => jaccard(p.text, q.text) >= 0.5);
  });
  if (questions.length < before) notes.push(`${before - questions.length} pregunta(es) descartada(es) per exclusió, anonimat, to o repetició.`);
  if (questions.filter((q) => q.type === "open").length > maxOpen(need.collective)) {
    let seen = 0;
    questions = questions.filter((q) => q.type !== "open" || ++seen <= maxOpen(need.collective));
  }
  const trimmed = trimToBudget(questions, need.maxSeconds);
  if (trimmed.length < questions.length) notes.push(`S'han tret ${questions.length - trimmed.length} pregunta(es) per ajustar-se a ${need.maxSeconds} s.`);
  questions = trimmed;
  if (questions.length < 3) {
    const extra = fallbackQuestions(need, questions.map((q) => q.text)).filter((e) => e.type !== "open" || !need.maxSeconds || estimateSeconds([...questions, e].map((x) => x.type)) <= need.maxSeconds).slice(0, 3 - questions.length);
    questions = [...questions, ...extra];
    notes.push("S'han afegit preguntes de plantilla per arribar al mínim de 3.");
  }
  return { title: survey.title, intro: survey.intro, questions, source, notes };
}

/** Draft a micro-survey from a need. Never throws: falls back to a template and says so in `source` and `notes`. */
export async function draftSurvey(need: NeedInput): Promise<DraftSurvey> {
  try {
    const { value, left } = await askWithRepair(SYSTEM, userPrompt(need), (x) => draftSurveySchema.parse(x), survProblems(need));
    return finish(value, need, "llm", left.length ? [`Revisa: ${left.slice(0, 3).join(" ")}`] : []);
  } catch (e) {
    const why = e instanceof LlmUnavailable ? e.message : "resposta de la IA no vàlida";
    return finish(fallbackSurvey(need), need, "fallback", [`Plantilla de reserva: ${why}.`]);
  }
}

const SINGLE_SYSTEM = SYSTEM.replace(/FORMAT:.*\n/, `FORMAT: {"text": string, "type": "scale5"|"scale10"|"yes_no"|"open", "low"?: string, "high"?: string, "domain": string, "reason": string} (una sola pregunta, no una enquesta)\n`)
  .replace(/- "title":.*\n/, "")
  .replace(/EXEMPLE 1[\s\S]*$/, "");

/** Propose a different wording for one question, keeping the rest of the survey in mind. */
export async function redraftQuestion(need: NeedInput, current: DraftQuestion, others: DraftQuestion[]): Promise<{ question: DraftQuestion; source: "llm" | "fallback" } | null> {
  const user = `${userPrompt({ ...need, maxSeconds: null })}\nPreguntes ja incloses (no les repeteixis ni t'hi assemblis): ${others.map((o) => `"${o.text}"`).join("; ") || "cap"}\nPregunta a substituir: "${current.text}" (tipus ${current.type}, domini ${current.domain}).\nProposa UNA pregunta nova que serveixi per al mateix propòsit però des d'un angle diferent, amb paraules i estructura diferents, ${current.type === "open" ? "oberta" : "del mateix tipus"} i que no es solapi amb les altres.`;
  const bad = (q: DraftQuestion) => {
    const p = findProblems(need, { title: "Títol", intro: "Introducció de prova", questions: [q, ...others.slice(0, 5)] }).filter((x) => !/falten|etiquetes/.test(x) || q.type === "yes_no" || q.type === "open" ? true : true);
    const mine = p.filter((x) => x.startsWith("Pregunta 1") || /^Les preguntes 1 /.test(x) || /^Hi ha \d+ preguntes obertes/.test(x));
    if (jaccard(q.text, current.text) >= 0.5 || norm0(q.text) === norm0(current.text)) mine.push("La pregunta és massa semblant a la que substitueix: canvia l'angle i les paraules.");
    for (const o of others) if (jaccard(q.text, o.text) >= 0.5) mine.push("La pregunta es repeteix amb una altra de l'enquesta.");
    return mine;
  };
  try {
    const { value, left } = await askWithRepair(SINGLE_SYSTEM, user, (x) => polish(draftQuestionSchema.parse(x)), bad);
    if (left.length === 0) return { question: value, source: "llm" };
  } catch {
    /* fall through to the template */
  }
  const f = fallbackReplacement(need, current, others);
  return f ? { question: f, source: "fallback" } : null;
}

const norm0 = (s: string) => s.toLowerCase().replace(/[^a-zà-ü0-9]/g, "");
