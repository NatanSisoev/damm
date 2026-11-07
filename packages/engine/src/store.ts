// SQL access for the engine. The only module that knows table and column names.
import type { QuestionType } from "@damm/shared";
import type { EngineConfig } from "./config.ts";
import { all, one, run, type SqlDatabase } from "./db.ts";
import { EMPTY_ITEM, type ItemStats } from "./item-bias.ts";
import { parseOptions, type QuestionDef } from "./normalize.ts";
import type { PersonDomainState } from "./person.ts";

interface PreguntaRow {
  id: number;
  domini_id: number;
  collectiu_id: number | null;
  text: string;
  tipus: QuestionType;
  facet: string | null;
  polarity: number;
  options_json: string | null;
  is_followup: number;
  necessitat_id: number | null;
  prioritat: number;
}

const Q_COLS = "id, domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, necessitat_id, prioritat";

export function toQuestion(r: PreguntaRow): QuestionDef {
  return {
    id: r.id,
    domainId: r.domini_id,
    collectiuId: r.collectiu_id,
    type: r.tipus,
    text: r.text,
    facet: r.facet ?? `q${r.id}`,
    polarity: r.polarity === -1 ? -1 : 1,
    options: parseOptions(r.tipus, r.options_json),
    isFollowup: r.is_followup === 1,
    needId: r.necessitat_id,
    priority: r.prioritat,
  };
}

// Need questions are served only once HR has published their need (necessitat.estat = 'publicada').
export const approvedQuestionsFor = (db: SqlDatabase, collectiuId: number) =>
  all<PreguntaRow>(
    db,
    `SELECT ${Q_COLS} FROM pregunta WHERE estat = 'aprovada' AND (collectiu_id IS NULL OR collectiu_id = ?)
       AND (necessitat_id IS NULL OR necessitat_id IN (SELECT id FROM necessitat WHERE estat = 'publicada'))`,
    collectiuId,
  ).map(toQuestion);

const Q_COLS_P = Q_COLS.split(", ").map((c) => `p.${c}`).join(", ");

/** Unanswered questions of published needs for the account's collective, not yet in `day`'s batch. */
export const publishedNeedsMissing = (db: SqlDatabase, accountId: string, collectiuId: number, day: string) =>
  all<PreguntaRow>(
    db,
    `SELECT ${Q_COLS_P} FROM pregunta p JOIN necessitat n ON n.id = p.necessitat_id
      WHERE p.estat = 'aprovada' AND p.is_followup = 0 AND n.estat = 'publicada'
        AND (n.collectiu_id IS NULL OR n.collectiu_id = ?) AND (p.collectiu_id IS NULL OR p.collectiu_id = ?)
        AND NOT EXISTS (SELECT 1 FROM resposta r WHERE r.compte_id = ? AND r.pregunta_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.compte_id = ? AND a.day = ? AND a.pregunta_id = p.id)
      ORDER BY p.prioritat DESC, p.id`,
    collectiuId,
    collectiuId,
    accountId,
    accountId,
    day,
  ).map(toQuestion);

export const allQuestions = (db: SqlDatabase) =>
  new Map(all<PreguntaRow>(db, `SELECT ${Q_COLS} FROM pregunta`).map((r) => [r.id, toQuestion(r)]));

export function questionsByIds(db: SqlDatabase, ids: number[]): Map<number, QuestionDef> {
  if (ids.length === 0) return new Map();
  const rows = all<PreguntaRow>(db, `SELECT ${Q_COLS} FROM pregunta WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return new Map(rows.map((r) => [r.id, toQuestion(r)]));
}

export interface Account {
  id: string;
  collectiuId: number;
  tornId: number | null;
}

export function getAccount(db: SqlDatabase, accountId: string): Account | undefined {
  const r = one<{ id: string; collectiu_id: number; torn_id: number | null }>(
    db,
    "SELECT id, collectiu_id, torn_id FROM compte WHERE id = ?",
    accountId,
  );
  return r && { id: r.id, collectiuId: r.collectiu_id, tornId: r.torn_id };
}

// --- assignment ---------------------------------------------------------------------------

export interface AssignmentRow {
  id: number;
  pregunta_id: number;
  slot: number;
  reason: "monitor" | "need" | "followup";
  answered_at: string | null;
}

export const assignmentsFor = (db: SqlDatabase, accountId: string, day: string) =>
  all<AssignmentRow>(
    db,
    "SELECT id, pregunta_id, slot, reason, answered_at FROM assignment WHERE compte_id = ? AND day = ? ORDER BY slot",
    accountId,
    day,
  );

export function lastSeenByItem(db: SqlDatabase, accountId: string): Map<number, string> {
  const rows = all<{ q: number; d: string }>(
    db,
    `SELECT q, MAX(d) AS d FROM (
       SELECT pregunta_id AS q, day AS d FROM assignment WHERE compte_id = ?
       UNION ALL SELECT pregunta_id, date(data) FROM resposta WHERE compte_id = ?
     ) GROUP BY q`,
    accountId,
    accountId,
  );
  return new Map(rows.map((r) => [r.q, r.d]));
}

export const answeredQuestionIds = (db: SqlDatabase, accountId: string) =>
  new Set(all<{ q: number }>(db, "SELECT DISTINCT pregunta_id AS q FROM resposta WHERE compte_id = ?", accountId).map((r) => r.q));

// --- person_domain_state ------------------------------------------------------------------

interface PersonRow {
  compte_id: string;
  domini_id: number;
  level: number;
  variance: number;
  n: number;
  last_at: string;
  last_z: number | null;
  pending_followup_level: number | null;
  followup_due: string | null;
  confirmed_change_at: string | null;
  confirmed_change_dir: number | null;
}

const toPerson = (r: PersonRow): PersonDomainState => ({
  level: r.level,
  variance: r.variance,
  n: r.n,
  lastAt: r.last_at,
  lastZ: r.last_z,
  pendingFollowupLevel: r.pending_followup_level,
  followupDue: r.followup_due,
  confirmedChangeAt: r.confirmed_change_at,
  confirmedChangeDir: r.confirmed_change_dir === 1 ? 1 : r.confirmed_change_dir === -1 ? -1 : null,
});

export function getPersonState(db: SqlDatabase, accountId: string, domainId: number): PersonDomainState | null {
  const r = one<PersonRow>(db, "SELECT * FROM person_domain_state WHERE compte_id = ? AND domini_id = ?", accountId, domainId);
  return r ? toPerson(r) : null;
}

export function putPersonState(db: SqlDatabase, accountId: string, domainId: number, s: PersonDomainState): void {
  run(
    db,
    `INSERT INTO person_domain_state (compte_id, domini_id, level, variance, n, last_at, last_z, pending_followup_level,
       followup_due, confirmed_change_at, confirmed_change_dir)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(compte_id, domini_id) DO UPDATE SET level = excluded.level, variance = excluded.variance, n = excluded.n,
       last_at = excluded.last_at, last_z = excluded.last_z, pending_followup_level = excluded.pending_followup_level,
       followup_due = excluded.followup_due, confirmed_change_at = excluded.confirmed_change_at,
       confirmed_change_dir = excluded.confirmed_change_dir`,
    accountId,
    domainId,
    s.level,
    s.variance,
    s.n,
    s.lastAt,
    s.lastZ,
    s.pendingFollowupLevel,
    s.followupDue,
    s.confirmedChangeAt,
    s.confirmedChangeDir,
  );
}

export const dueFollowupDomains = (db: SqlDatabase, accountId: string, day: string) =>
  all<{ d: number }>(
    db,
    `SELECT domini_id AS d FROM person_domain_state
     WHERE compte_id = ? AND pending_followup_level IS NOT NULL AND followup_due <= ? ORDER BY followup_due, domini_id`,
    accountId,
    day,
  ).map((r) => r.d);

/** Person states of everyone in a collective (engine-internal; never returned to callers). */
export const collectiveStates = (db: SqlDatabase, collectiuId: number) =>
  all<{ domini_id: number; level: number; variance: number; last_at: string; last_z: number | null }>(
    db,
    `SELECT s.domini_id, s.level, s.variance, s.last_at, s.last_z
     FROM person_domain_state s JOIN compte c ON c.id = s.compte_id WHERE c.collectiu_id = ?`,
    collectiuId,
  );

// --- item_stats / format_stats / HR config ------------------------------------------------

export function getItemStats(db: SqlDatabase, questionId: number): ItemStats {
  const r = one<{ bias: number; n: number; resid_sum: number }>(db, "SELECT bias, n, resid_sum FROM item_stats WHERE pregunta_id = ?", questionId);
  return r ? { bias: r.bias, n: r.n, residSum: r.resid_sum } : { ...EMPTY_ITEM };
}

export function putItemStats(db: SqlDatabase, questionId: number, s: ItemStats): void {
  run(
    db,
    `INSERT INTO item_stats (pregunta_id, bias, n, resid_sum) VALUES (?,?,?,?)
     ON CONFLICT(pregunta_id) DO UPDATE SET bias = excluded.bias, n = excluded.n, resid_sum = excluded.resid_sum`,
    questionId,
    s.bias,
    s.n,
    s.residSum,
  );
}

export function formatStatsFor(db: SqlDatabase, cfg: EngineConfig, collectiuId: number, tornId: number | null) {
  const rows = all<{ tipus: QuestionType; alpha: number; beta: number }>(
    db,
    "SELECT tipus, alpha, beta FROM format_stats WHERE collectiu_id = ? AND torn_id = ?",
    collectiuId,
    tornId ?? 0,
  );
  const m = new Map(rows.map((r) => [r.tipus, { alpha: r.alpha, beta: r.beta }]));
  return (t: QuestionType) => {
    const prior = cfg.priors.formatBeta[t] ?? [1, 1];
    return m.get(t) ?? { alpha: prior[0], beta: prior[1] };
  };
}

export function bumpFormatStats(db: SqlDatabase, cfg: EngineConfig, collectiuId: number, tornId: number | null, t: QuestionType, success: boolean) {
  const prior = cfg.priors.formatBeta[t] ?? [1, 1];
  run(
    db,
    `INSERT INTO format_stats (collectiu_id, torn_id, tipus, alpha, beta) VALUES (?,?,?,?,?)
     ON CONFLICT(collectiu_id, torn_id, tipus) DO UPDATE SET alpha = alpha + ?, beta = beta + ?`,
    collectiuId,
    tornId ?? 0,
    t,
    prior[0] + (success ? 1 : 0),
    prior[1] + (success ? 0 : 1),
    success ? 1 : 0,
    success ? 0 : 1,
  );
}

/** Specific row for the collective, else the default (NULL collective) row, else fallback. */
function weightLookup<K extends string | number>(rows: { collectiu_id: number | null; k: K; weight: number }[], collectiuId: number, fallback: number) {
  const specific = new Map(rows.filter((r) => r.collectiu_id === collectiuId).map((r) => [r.k, r.weight]));
  const general = new Map(rows.filter((r) => r.collectiu_id === null).map((r) => [r.k, r.weight]));
  return (k: K) => specific.get(k) ?? general.get(k) ?? fallback;
}

export const domainWeights = (db: SqlDatabase, collectiuId: number) =>
  weightLookup(all<{ collectiu_id: number | null; k: number; weight: number }>(db, "SELECT collectiu_id, domini_id AS k, weight FROM domain_weight"), collectiuId, 1);

export const formatPrefs = (db: SqlDatabase, collectiuId: number) =>
  weightLookup(all<{ collectiu_id: number | null; k: QuestionType; weight: number }>(db, "SELECT collectiu_id, tipus AS k, weight FROM format_preference"), collectiuId, 1);

// --- population ---------------------------------------------------------------------------

/** Population size per collective × shift: synthetic population, else accounts. */
export function population(db: SqlDatabase): { collectiuId: number; tornId: number | null; n: number }[] {
  const synth = all<{ c: number; t: number | null; n: number }>(db, "SELECT collectiu_id AS c, torn_id AS t, COUNT(*) AS n FROM empleat_sintetic GROUP BY c, t");
  const rows = synth.length ? synth : all<{ c: number; t: number | null; n: number }>(db, "SELECT collectiu_id AS c, torn_id AS t, COUNT(*) AS n FROM compte GROUP BY c, t");
  return rows.map((r) => ({ collectiuId: r.c, tornId: r.t, n: r.n }));
}

export const domainIds = (db: SqlDatabase) => all<{ id: number }>(db, "SELECT id FROM domini ORDER BY id").map((r) => r.id);
