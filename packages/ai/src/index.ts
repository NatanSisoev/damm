// AI proposes, a human decides. Plain input, plain output: no database imports here.
import { DOMINIS } from "@damm/shared";
import { violatesExclusions } from "./exclusions";
import { fallbackQuestions, fallbackReplacement, fallbackSurvey, isShortTone } from "./fallback";
import { chatJson, LlmUnavailable } from "./llm";
import { draftQuestionSchema, draftSurveySchema, type DraftQuestion, type DraftSurvey, type NeedInput } from "./types";

export { estimateSeconds, DRAFT_TYPES } from "./types";
export type { DraftQuestion, DraftSurvey, DraftType, NeedInput } from "./types";
export { violatesExclusions } from "./exclusions";
export { classifyCommentsLlm, summariseThemeLlm } from "./comments";
export type { CommentToClassify, SummaryRequest, ThemeOption } from "./comments";

const SYSTEM = `Ets un expert en enquestes breus d'escolta activa per a una empresa cervesera (dades sintètiques). Respon NOMÉS amb un objecte JSON, sense text addicional. Escrius en català.
Format: {"title": string, "intro": string, "questions": [{"text": string, "type": "scale5"|"scale10"|"yes_no"|"open", "domain": string, "reason": string}]}
- Entre 3 i 6 preguntes. "domain" ha de ser exactament un d'aquests: ${DOMINIS.join(" | ")}.
- scale5 = escala d'1 a 5; scale10 = escala de 0 a 10; yes_no = sí/no; open = text lliure (màxim una o dues).
- "reason" és una sola frase que explica per què la pregunta ajuda a respondre la necessitat.
- Preguntes neutres, sense induir la resposta, sense dades personals i que no permetin identificar ningú.
- Mai preguntis res del que l'apartat "NO s'ha de preguntar" prohibeix.`;

function toneRules(collective?: string | null): string {
  return isShortTone(collective)
    ? "To: molt proper i càlid, tutejant. Frases curtes (màxim 12 paraules), vocabulari simple, 4 preguntes, com a màxim una oberta, preferència per escales i sí/no. Pensat per respondre al mòbil dret a la planta o al magatzem."
    : "To: cordial i professional, tutejant. Frases clares (màxim 20 paraules), 4 a 6 preguntes, com a màxim dues obertes.";
}

function userPrompt(need: NeedInput): string {
  return [
    `Objectiu: ${need.objective}`,
    need.context?.trim() ? `Context: ${need.context.trim()}` : null,
    `Col·lectiu: ${need.collective ?? "tots els col·lectius"}`,
    need.maxSeconds ? `Durada màxima: ${need.maxSeconds} segons (estimació: 8 s per escala o sí/no, 30 s per oberta). Ajusta el nombre i tipus de preguntes perquè hi càpiguen.` : null,
    need.exclusions?.trim() ? `NO s'ha de preguntar: ${need.exclusions.trim()}` : "NO s'ha de preguntar: (res indicat)",
    toneRules(need.collective),
  ].filter(Boolean).join("\n");
}

async function askValidated<T>(system: string, user: string, parse: (x: unknown) => T): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parse(await chatJson(system, user));
    } catch (e) {
      if (e instanceof LlmUnavailable) throw e; // no point retrying a missing key or a timeout
      lastErr = e;
    }
  }
  throw lastErr;
}

function finish(survey: { title: string; intro: string; questions: DraftQuestion[] }, need: NeedInput, source: "llm" | "fallback", notes: string[]): DraftSurvey {
  let questions = survey.questions.filter((q) => !violatesExclusions(q.text, need.exclusions));
  const dropped = survey.questions.length - questions.length;
  if (dropped > 0) notes.push(`${dropped} pregunta(es) descartada(es) per tocar una exclusió.`);
  if (questions.length < 3) {
    const extra = fallbackQuestions(need, questions.map((q) => q.text)).slice(0, 3 - questions.length);
    questions = [...questions, ...extra];
    notes.push("S'han afegit preguntes de plantilla per arribar al mínim de 3.");
  }
  return { title: survey.title, intro: survey.intro, questions, source, notes };
}

/** Draft a micro-survey from a need. Never throws: falls back to a template and says so in `source` and `notes`. */
export async function draftSurvey(need: NeedInput): Promise<DraftSurvey> {
  try {
    const s = await askValidated(SYSTEM, userPrompt(need), (x) => draftSurveySchema.parse(x));
    return finish(s, need, "llm", []);
  } catch (e) {
    const why = e instanceof LlmUnavailable ? e.message : "resposta de la IA no vàlida";
    return finish(fallbackSurvey(need), need, "fallback", [`Plantilla de reserva: ${why}.`]);
  }
}

const SINGLE_SYSTEM = SYSTEM.replace(/Format:.*\n/, `Format: {"text": string, "type": "scale5"|"scale10"|"yes_no"|"open", "domain": string, "reason": string} (una sola pregunta)\n`)
  .replace("- Entre 3 i 6 preguntes. ", "- ");

/** Propose a different wording for one question, keeping the rest of the survey in mind. */
export async function redraftQuestion(need: NeedInput, current: DraftQuestion, others: DraftQuestion[]): Promise<{ question: DraftQuestion; source: "llm" | "fallback" } | null> {
  const user = `${userPrompt(need)}\nPreguntes ja incloses (no les repeteixis): ${others.map((o) => `"${o.text}"`).join("; ") || "cap"}\nPregunta a substituir: "${current.text}" (domini ${current.domain}). Proposa una pregunta diferent que serveixi per al mateix propòsit.`;
  try {
    const q = await askValidated(SINGLE_SYSTEM, user, (x) => draftQuestionSchema.parse(x));
    if (!violatesExclusions(q.text, need.exclusions) && q.text !== current.text) return { question: q, source: "llm" };
  } catch {
    /* fall through to the template */
  }
  const f = fallbackReplacement(need, current, others);
  return f ? { question: f, source: "fallback" } : null;
}
