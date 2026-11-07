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

export type PreguntaTipus = "escala5" | "escala10" | "swipe" | "ranking" | "obert";
export type PreguntaEstat = "draft" | "aprovada" | "retirada";
export type NecessitatEstat = "oberta" | "publicada" | "tancada";
export type Canal = "app" | "mobil_qr";
export type SenyalTipus = "emergent" | "feble" | "baixa_participacio";
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
  tipus: PreguntaTipus;
  necessitatId: number | null;
  estat: PreguntaEstat;
  prioritat: number;
  generadaPerIa: boolean;
}

// --- API: GET /api/pool/next -------------------------------------------------
// Account is identified by the session, never by a request parameter.
export interface PoolNextResponse {
  preguntes: Pick<Pregunta, "id" | "dominiId" | "text" | "tipus">[];
}

// --- API: POST /api/responses ------------------------------------------------
export interface RespostaInput {
  preguntaId: number;
  valorNum?: number | null;
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
  periode: string;
  n: number;
  confianca: number | null;
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
