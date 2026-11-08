import { z } from "zod";
import { DOMINIS } from "@damm/shared";

/** English question types (target contract). `ranking` is not generated: it needs options the draft flow does not model yet. */
export const DRAFT_TYPES = ["scale5", "scale10", "yes_no", "open"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

/** Proposed wording in another language. Optional: HR edits it before approval; missing means "fall back to Catalan". */
const translatedSchema = z.object({ text: z.string().trim().min(1).max(240) });
export const draftI18nSchema = z.object({ es: translatedSchema.optional(), en: translatedSchema.optional() });

export const draftQuestionSchema = z.object({
  text: z.string().trim().min(8).max(240),
  type: z.enum(DRAFT_TYPES),
  domain: z.enum(DOMINIS),
  reason: z.string().trim().min(3).max(240),
  /** Scale end labels (scale5/scale10), for example "Mai" / "Sempre". Optional so older callers and saved drafts stay valid. */
  low: z.string().trim().min(1).max(30).optional(),
  high: z.string().trim().min(1).max(30).optional(),
  /** Spanish and English wording (Catalan `text` is canonical). Added by the translation pass, never required from the drafting call. */
  i18n: draftI18nSchema.optional(),
});

export const draftSurveySchema = z.object({
  title: z.string().trim().min(3).max(120),
  intro: z.string().trim().min(10).max(400),
  questions: z.array(draftQuestionSchema).min(2).max(6),
});

export type DraftQuestion = z.infer<typeof draftQuestionSchema>;

/** Plain input: no database types here. */
export interface NeedInput {
  objective: string;
  context?: string | null;
  exclusions?: string | null;
  collective?: string | null; // collective name, or null for all
  /** Exact number of questions per person (2 to 6). When set, the draft has exactly this many. */
  questionCount?: number | null;
  /** Legacy seconds budget (follow-ups). Ignored when questionCount is set. */
  maxSeconds?: number | null;
}

export interface DraftSurvey {
  title: string;
  intro: string;
  questions: DraftQuestion[];
  source: "llm" | "fallback";
  /** Why the fallback was used, or what was filtered. Never contains secrets. */
  notes: string[];
}

/** Seconds a respondent needs: 8 per scale or yes/no, 15 per ranking, 30 per open question. */
export function estimateSeconds(types: readonly string[]): number {
  return types.reduce((sum, t) => sum + (t === "open" ? 30 : t === "ranking" ? 15 : 8), 0);
}
