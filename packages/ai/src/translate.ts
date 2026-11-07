// Natural Spanish and English wording of drafted questions. Catalan stays canonical; these are
// proposals HR can edit in the review screen before approving (AI proposes, a human decides).
import { chatJson } from "./llm";
import type { DraftQuestion } from "./types";

const SYSTEM = `Ets traductor professional d'enquestes breus de clima laboral. Rebràs preguntes en català i les has de reescriure en castellà (es) i en anglès (en).
Respon NOMÉS amb un objecte JSON: {"questions":[{"es": string, "en": string}, ...]}, amb exactament una entrada per pregunta i en el mateix ordre.
- Natural i idiomàtic, no literal: com ho diria una persona de l'empresa. Mateix to proper i breu, tutejant (castellà: "tú"; anglès: "you").
- Mateix sentit, mateix tipus (escala, sí/no, oberta) i mateixa idea única. No afegeixis ni treguis res.
- Redacció neutra, sense marca de gènere. Anglès britànic.
- No traduïs noms propis ni xifres.`;

export interface QuestionTranslation { es: string; en: string }

/** Translate the Catalan text of each question. Returns null when the model is unavailable or answers badly: callers then leave es/en empty. */
export async function translateQuestionTexts(texts: string[]): Promise<QuestionTranslation[] | null> {
  if (texts.length === 0) return [];
  try {
    const user = `Preguntes (${texts.length}):\n${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
    const raw = (await chatJson(SYSTEM, user, { temperature: 0.2, maxTokens: 2500 })) as { questions?: { es?: unknown; en?: unknown }[] };
    const out = raw.questions;
    if (!Array.isArray(out) || out.length !== texts.length) return null;
    const res: QuestionTranslation[] = [];
    for (const o of out) {
      const es = typeof o?.es === "string" ? o.es.trim() : "";
      const en = typeof o?.en === "string" ? o.en.trim() : "";
      if (es.length < 4 || en.length < 4) return null;
      res.push({ es: es.slice(0, 240), en: en.slice(0, 240) });
    }
    return res;
  } catch {
    return null;
  }
}

/** Attach `i18n` to each question when the translation call succeeds. Never throws; never changes the Catalan text. */
export async function withTranslations(questions: DraftQuestion[]): Promise<DraftQuestion[]> {
  const tr = await translateQuestionTexts(questions.map((q) => q.text));
  if (!tr) return questions;
  return questions.map((q, i) => ({ ...q, i18n: { es: { text: tr[i].es }, en: { text: tr[i].en } } }));
}
