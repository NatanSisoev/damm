// Shared contract: types and constants. Agree changes before building on them.
import type { Translations } from "./i18n.ts";
export * from "./i18n.ts";

export const MIN_GROUP_SIZE = 10;

export const COLLECTIUS = ["Fàbriques", "Logística", "Comercial", "Oficines"] as const;
export type Collectiu = (typeof COLLECTIUS)[number];

export const DOMINIS = [
  "Benestar",
  "Lideratge",
  "Desenvolupament",
  "Cultura i pertinença",
  "Entorn i relacions",
  "Condicions i organització",
] as const;
export type Domini = (typeof DOMINIS)[number];

export const TORNS = ["mati", "tarda", "nit"] as const;
export type Torn = (typeof TORNS)[number];

export const PERIODES_SEED = ["2026-08", "2026-09", "2026-10"] as const;

/** Question (answer) types. Values are English and stable; see docs/question-types.md. */
export const QUESTION_TYPES = ["scale5", "scale10", "yes_no", "pair", "choice", "ranking", "open"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
/** @deprecated use QuestionType */
export type PreguntaTipus = QuestionType;
export type PreguntaEstat = "draft" | "aprovada" | "retirada";
export type NecessitatEstat = "oberta" | "publicada" | "tancada";
export type Canal = "app" | "mobil_qr";
export type SenyalTipus =
  | "emergent"
  | "feble"
  | "baixa_participacio"
  | "sharp_drop"
  | "sustained_decline"
  | "changepoint_cluster"
  | "polarisation"
  | "low_confidence"
  | "improvement";
export type Severity = "info" | "warning" | "critical";
export type AlarmStatus = "open" | "acknowledged" | "action_linked" | "resolved" | "dismissed";
export type Audience = "hr" | "hr_manager";
export type AssignmentReason = "monitor" | "need" | "followup";
/** How a published query reaches people: inside the daily set, or as a one-off extra set. */
export type QueryDelivery = "daily" | "campaign";
export const QUESTION_COUNT_OPTIONS = [2, 3, 4, 5, 6] as const;
export const DEFAULT_QUESTION_COUNT = 3;
export type InsightKind =
  | "domain_state"
  | "top_mover"
  | "polarisation"
  | "importance_gap"
  | "driver"
  | "trajectory_mix"
  | "followup_confirmation"
  | "segment_gap"
  | "action_effect"
  | "narrative";

/** pair/choice options carry an oriented score (1 = best); ranking options carry the domain they stand for. */
export interface ScoredOption {
  label: string;
  score: number;
  i18n?: Translations; // C-i18n: label per language; `label` stays the canonical text
}
export interface RankingOption {
  label: string;
  domainId: number;
  i18n?: Translations;
}
export type RecomanacioEstat = "proposada" | "aprovada" | "descartada";

export interface Necessitat {
  id: number;
  textNl: string;
  collectiuId: number | null;
  duradaMaxS: number | null;
  questionCount: number | null;
  delivery: QueryDelivery;
  exclusions: string | null;
  estat: NecessitatEstat;
}

/** When a conditional follow-up is served: 'low' = scale5/scale10 raw answer <= 2, 'no' = yes/no answered no. */
export type FollowupWhen = "low" | "no";

export interface Pregunta {
  id: number;
  dominiId: number;
  collectiuId: number | null;
  text: string;
  textI18n?: Translations | null; // C-i18n: text per language (ca/es/en); `text` is the fallback
  tipus: QuestionType;
  necessitatId: number | null;
  estat: PreguntaEstat;
  prioritat: number;
  generadaPerIa: boolean;
  facet?: string | null;
  polarity?: 1 | -1;
  options?: ScoredOption[] | RankingOption[] | null; // from options_json
  isFollowup?: boolean;
  followupOf?: number | null; // conditional follow-up: parent question id
  followupWhen?: FollowupWhen | null;
}

// --- API: GET /api/pool/next -------------------------------------------------
// Account is identified by the session, never by a request parameter.
// Returns today's batch (questions_per_day items, fixed for the day).
export type PoolQuestion = Pick<Pregunta, "id" | "dominiId" | "text" | "textI18n" | "tipus" | "options">;
/** Pending one-off campaign set: all questions of one published campaign query the person has not answered. */
export interface PoolCampaign {
  needId: number;
  title: string;
  intro: string | null;
  preguntes: PoolQuestion[];
}
export interface PoolNextResponse {
  preguntes: PoolQuestion[];
  /** Extra one-off set on top of the daily questions; null when nothing is pending. */
  campaign: PoolCampaign | null;
}

// --- API: POST /api/responses ------------------------------------------------
export interface RespostaInput {
  preguntaId: number;
  valorNum?: number | null; // scale5: 1..5, scale10: 1..10 (older rows may hold 0), yes_no: 0/1; pair/choice: option index
  valueJson?: number[] | null; // ranking: option indices, best first
  answerMs?: number | null; // time from display to answer
  comentari?: string | null; // redacted server-side before insert
}
/** Returned by POST /api/responses when an answer triggers a conditional follow-up (served right after it, skippable, outside the daily cap). */
export type PoolFollowup = PoolQuestion & { parentId: number };
/** 204 with no body normally; 200 with this body when an accepted answer triggers conditional follow-ups. */
export interface PostResponsesResult {
  followups: PoolFollowup[];
}
export interface PostResponsesRequest {
  respostes: RespostaInput[];
  canal?: Canal;
}

// --- Analysis outputs (what the HR dashboard reads) --------------------------
// Every output carries n. When suppressed, value fields are null.
export interface Agregat {
  periode: string;
  collectiuId: number | null;
  tornId: number | null;
  dominiId: number | null;
  n: number;
  mitjana: number | null;
  score?: number | null; // engine, 0..10
  confidence?: number | null; // engine, 0..100
  consensus?: number | null; // engine, 0..100
  suprimit: boolean;
}

export interface Insight {
  id: number;
  kind: InsightKind;
  periode: string;
  collectiuId: number | null;
  tornId: number | null;
  dominiId: number | null;
  n: number;
  value: number | null;
  detail: Record<string, unknown> | null;
  suprimit: boolean;
}

export interface Tema {
  id: number;
  etiqueta: string;
  resum: string | null;
  periode: string;
  n: number;
  emergent: boolean;
  suprimit: boolean;
}

export interface Senyal {
  id: number;
  tipus: SenyalTipus;
  descripcio: string;
  collectiuId: number | null;
  tornId?: number | null;
  dominiId?: number | null;
  periode: string;
  n: number;
  confianca: number | null;
  severity?: Severity;
  status?: AlarmStatus;
  audience?: Audience;
  createdAt?: string;
  suprimit: boolean;
}

export interface Recomanacio {
  id: number;
  senyalId: number | null;
  text: string;
  estat: RecomanacioEstat;
  seguimentNecessitatId: number | null;
}

/** True when a segment must be hidden everywhere (dashboard and exports). */
export const isSuppressed = (n: number): boolean => n < MIN_GROUP_SIZE;

/**
 * Data retention (R-PRIV-8). Raw rows are kept only as long as analysis needs them; aggregates, themes,
 * signals and insights are kept (they hold no per-person data). Windows are in whole calendar months.
 * 24 months keeps the seeded Aug-Oct 2026 demo data until Aug 2028.
 */
export const RETENTION = {
  /** Raw `resposta` rows (and their redacted comments, comment-theme links and seed labels) older than this are deleted. */
  rawResponseMonths: 24,
  /** Accounts with no answer for this long (and created before the cutoff) are deleted with their per-person engine state. */
  inactiveAccountMonths: 24,
  /** Push subscriptions are deleted on logout; a subscription with no matching activity is also dropped after this long. */
  pushSubscriptionMonths: 12,
} as const;
