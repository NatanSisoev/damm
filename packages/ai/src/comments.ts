// Optional LLM helpers for the comment analysis (engine: packages/engine/src/comments.ts). The engine injects these;
// without a key, or when a call fails, they return null and the engine keeps its deterministic result.
// Input is always redacted comments with no account or response ids. Summaries are checked by the engine against
// copying a source comment, and the LLM is never called in a dashboard request path (this runs in the job).
import { z } from "zod";
import { chatJson, LlmUnavailable } from "./llm";

export interface ThemeOption {
  key: string;
  label: string;
}
export interface CommentToClassify {
  id: number;
  text: string;
}
export interface SummaryRequest {
  theme: string;
  periode: string;
  collective: string | null;
  n: number;
  share: number;
  prevShare: number | null;
  emergent: boolean;
  coThemes: string[];
  sample: string[];
}

const classifySchema = z.object({ items: z.array(z.object({ id: z.number().int(), themes: z.array(z.string()).max(3) })) });
const summarySchema = z.object({ summary: z.string().trim().min(20).max(500) });

const CLASSIFY_SYSTEM = `Ets un analista de comentaris d'enquestes de clima laboral (dades sintètiques). Els comentaris són en català o castellà (a vegades anglès), amb possibles faltes d'ortografia, i ja estan anonimitzats.
Assigna a cada comentari d'1 a 3 temes de la llista (només les claus), el més rellevant primer. Un comentari pot tenir diversos temes. Si no encaixa en cap, deixa la llista buida. Ironia: interpreta el sentit real.
Respon NOMÉS amb JSON: {"items": [{"id": number, "themes": [string]}]}`;

/** LLM classifier for `runCommentAnalysis({ classify })`. Returns null when the LLM is unavailable or answers badly. */
export async function classifyCommentsLlm(comments: CommentToClassify[], themes: ThemeOption[]): Promise<Record<number, string[]> | null> {
  const user = `Temes disponibles:\n${themes.map((t) => `- ${t.key}: ${t.label}`).join("\n")}\n\nComentaris:\n${comments.map((c) => `${c.id}. ${c.text}`).join("\n")}`;
  try {
    const parsed = classifySchema.parse(await chatJson(CLASSIFY_SYSTEM, user));
    const valid = new Set(themes.map((t) => t.key));
    const out: Record<number, string[]> = {};
    for (const it of parsed.items) out[it.id] = it.themes.filter((k) => valid.has(k));
    return out;
  } catch (e) {
    if (e instanceof LlmUnavailable) return null;
    return null; // invalid JSON or shape: keep the rules
  }
}

const SUMMARY_SYSTEM = `Ets un analista d'escolta activa. Escrius en català un resum de 2 o 3 frases d'un tema que apareix als comentaris anònims d'un col·lectiu, per a Recursos Humans.
Normes: descriu què diuen les persones en conjunt i el canvi respecte al període anterior si n'hi ha. No citis ni copiïs cap comentari, no esmenis persones, càrrecs, llocs ni dates concretes. No facis recomanacions.
Respon NOMÉS amb JSON: {"summary": string}`;

/** LLM summary for `runCommentAnalysis({ summarise })`. Null when unavailable or invalid: the engine then uses its template. */
export async function summariseThemeLlm(input: SummaryRequest): Promise<string | null> {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const user = [
    `Tema: ${input.theme}`,
    `Col·lectiu: ${input.collective ?? "tota l'empresa"}`,
    `Període: ${input.periode}`,
    `Comentaris del tema: ${input.n} (${pct(input.share)} dels comentaris del col·lectiu)${input.prevShare !== null ? `; període anterior: ${pct(input.prevShare)}` : ""}`,
    input.emergent ? "És un tema emergent." : null,
    input.coThemes.length ? `Temes que hi apareixen sovint: ${input.coThemes.join(", ")}` : null,
    `Mostra de comentaris (només per entendre'ls, no els copiïs):\n${input.sample.map((s) => `- ${s}`).join("\n")}`,
  ].filter(Boolean).join("\n");
  try {
    return summarySchema.parse(await chatJson(SUMMARY_SYSTEM, user)).summary;
  } catch {
    return null;
  }
}
