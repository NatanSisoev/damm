// Decision trail (R-PRIV-10, N-11): every human decision on AI output, with who (a non-personal HR label), what, when
// and where the decided output came from (`font`). HR side only: no compte_id and no employee data in this table.
import { getDb } from "./connection";

export const DECISION_ENTITIES = ["pregunta", "recomanacio", "necessitat", "senyal"] as const;
export type DecisionEntity = (typeof DECISION_ENTITIES)[number];

export const DECISION_ACTIONS = ["approve", "reject", "edit", "regenerate", "remove_followup", "publish", "close", "retire", "restore", "status", "archive", "unarchive", "reopen"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Where the decided output came from. */
export const DECISION_FONTS = ["ai_draft", "ai_redraft", "ai_followup", "ai_recommendation", "hr_edit", "engine_alarm", "engine_pool", "hr_need"] as const;
export type DecisionFont = (typeof DECISION_FONTS)[number];

/** Non-personal approver label: control characters and "@" stripped (no emails), max 60 chars, "HR" when empty. */
export function approverLabel(raw: unknown): string {
  const v = String(raw ?? "").replace(/[\u0000-\u001f\u007f@]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return v || "HR";
}

export interface DecisionInput {
  entity: DecisionEntity;
  entityId: number;
  action: DecisionAction;
  font: DecisionFont;
  actor?: string;
  necessitatId?: number | null;
  fromState?: string | null;
  toState?: string | null;
  subject?: string | null;
  textOriginal?: string | null;
  textFinal?: string | null;
  /** Fixed timestamp (UTC, 'YYYY-MM-DD HH:MM:SS'); the seed uses it, normal code leaves it to the DB clock. */
  at?: string;
}

const clip = (s: string | null | undefined, n: number) => (s == null ? null : s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Appends one decision. Never throws into the caller's flow: the trail must not break a human action. */
export function recordDecision(d: DecisionInput): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO decisio (created_at, entity, entity_id, necessitat_id, action, from_state, to_state, font, actor, subject, text_original, text_final)
         VALUES (COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.at ?? null, d.entity, d.entityId, d.necessitatId ?? null, d.action, d.fromState ?? null, d.toState ?? null, d.font, approverLabel(d.actor), clip(d.subject, 240), clip(d.textOriginal, 600), clip(d.textFinal, 600));
  } catch (err) {
    console.error("recordDecision", err);
  }
}

/** What a question is and where it came from: a suggested follow-up, an AI draft for a need, or the engine's own question bank. */
export function questionInfo(id: number): { text: string; necessitatId: number | null; estat: string; font: DecisionFont } | null {
  const r = getDb().prepare("SELECT text, necessitat_id AS n, estat, followup_of AS f FROM pregunta WHERE id = ?").get(id) as { text: string; n: number | null; estat: string; f: number | null } | undefined;
  if (!r) return null;
  return { text: r.text, necessitatId: r.n, estat: r.estat, font: r.f != null ? "ai_followup" : r.n != null ? "ai_draft" : "engine_pool" };
}

/** The AI's first wording of a question, kept across several HR edits. */
export function originalQuestionText(id: number, current: string): string {
  const r = getDb().prepare("SELECT text_original AS t FROM decisio WHERE entity = 'pregunta' AND entity_id = ? AND text_original IS NOT NULL ORDER BY id LIMIT 1").get(id) as { t: string } | undefined;
  return r?.t ?? current;
}

export function alarmInfo(id: number): { status: string; description: string } | null {
  const r = getDb().prepare("SELECT status, descripcio FROM senyal WHERE id = ?").get(id) as { status: string; descripcio: string } | undefined;
  return r ? { status: r.status, description: r.descripcio } : null;
}

export function recommendationInfo(id: number): { estat: string; subject: string; necessitatId: number | null } | null {
  const r = getDb().prepare("SELECT estat, COALESCE(titol, text) AS s, seguiment_necessitat_id AS n FROM recomanacio WHERE id = ?").get(id) as { estat: string; s: string; n: number | null } | undefined;
  return r ? { estat: r.estat, subject: r.s, necessitatId: r.n } : null;
}

export function needSubject(id: number): { subject: string; estat: string } | null {
  const r = getDb().prepare("SELECT COALESCE(titol, text_nl) AS s, estat FROM necessitat WHERE id = ?").get(id) as { s: string; estat: string } | undefined;
  return r ? { subject: r.s, estat: r.estat } : null;
}

export interface DecisionRow {
  id: number;
  at: string;
  entity: DecisionEntity;
  entityId: number;
  necessitatId: number | null;
  action: DecisionAction;
  fromState: string | null;
  toState: string | null;
  font: DecisionFont;
  actor: string;
  subject: string | null;
  textOriginal: string | null;
  textFinal: string | null;
}

const SELECT = `SELECT id, created_at AS at, entity, entity_id AS entityId, necessitat_id AS necessitatId, action, from_state AS fromState, to_state AS toState,
  font, actor, subject, text_original AS textOriginal, text_final AS textFinal FROM decisio`;

/** Newest first. `necessitatId` limits to one need's trail (its questions, its follow-up recommendations). */
export function listDecisions(opts: { necessitatId?: number; limit?: number } = {}): DecisionRow[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
  const db = getDb();
  return (opts.necessitatId != null
    ? db.prepare(`${SELECT} WHERE necessitat_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(opts.necessitatId, limit)
    : db.prepare(`${SELECT} ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit)) as DecisionRow[];
}

export interface DecisionSummary {
  total: number;
  first: string | null;
  last: string | null;
  /** Counts only; never a person. */
  byFont: { font: DecisionFont; n: number }[];
  byAction: { entity: DecisionEntity; action: DecisionAction; n: number }[];
  /** Question edits and regenerations: how often HR changed what the AI proposed. */
  edits: number;
}

export function decisionSummary(): DecisionSummary {
  const db = getDb();
  const t = db.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS a, MAX(created_at) AS b FROM decisio").get() as { n: number; a: string | null; b: string | null };
  const byFont = db.prepare("SELECT font, COUNT(*) AS n FROM decisio GROUP BY font ORDER BY n DESC").all() as DecisionSummary["byFont"];
  const byAction = db.prepare("SELECT entity, action, COUNT(*) AS n FROM decisio GROUP BY entity, action ORDER BY n DESC").all() as DecisionSummary["byAction"];
  const edits = (db.prepare("SELECT COUNT(*) AS n FROM decisio WHERE action IN ('edit','regenerate')").get() as { n: number }).n;
  return { total: t.n, first: t.a, last: t.b, byFont, byAction, edits };
}
