// Shared contract: types and constants. Agree changes before building on them.

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
export type AlarmStatus = "open" | "acknowledged" | "action_linked" | "resolved";
export type Audience = "hr" | "hr_manager";
export type AssignmentReason = "monitor" | "need" | "followup";
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
}
export interface RankingOption {
  label: string;
  domainId: number;
}
export type RecomanacioEstat = "proposada" | "aprovada" | "descartada";

export interface Necessitat {
  id: number;
  textNl: string;
  collectiuId: number | null;
  duradaMaxS: number | null;
  exclusions: string | null;
  estat: NecessitatEstat;
}

export interface Pregunta {
  id: number;
  dominiId: number;
  collectiuId: number | null;
  text: string;
  tipus: QuestionType;
  necessitatId: number | null;
  estat: PreguntaEstat;
  prioritat: number;
  generadaPerIa: boolean;
  facet?: string | null;
  polarity?: 1 | -1;
  options?: ScoredOption[] | RankingOption[] | null; // from options_json
  isFollowup?: boolean;
}

// --- API: GET /api/pool/next -------------------------------------------------
// Account is identified by the session, never by a request parameter.
// Returns today's batch (questions_per_day items, fixed for the day).
export interface PoolNextResponse {
  preguntes: Pick<Pregunta, "id" | "dominiId" | "text" | "tipus" | "options">[];
}

// --- API: POST /api/responses ------------------------------------------------
export interface RespostaInput {
  preguntaId: number;
  valorNum?: number | null; // scale5: 1..5, scale10: 0..10, yes_no: 0/1; pair/choice: option index
  valueJson?: number[] | null; // ranking: option indices, best first
  answerMs?: number | null; // time from display to answer
  comentari?: string | null; // redacted server-side before insert
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
