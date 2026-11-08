// HR-side data access. The only repository HR routes may import.
// Reads aggregate outputs and the analytics view; never `resposta` or `compte`.
import type { Agregat, Lang, QueryDelivery, Recomanacio, Senyal } from "@damm/shared";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";
import { overlayTranslations, RECOMMENDATION_FIELDS } from "./hr-i18n";
import type { SignalRecommendation } from "./hr-signals";
import { classifyChange, complementarySuppression, precisionBand, type Change, type HideReason, type PrecisionBand } from "./hr-rigour";

export interface DraftQuestion {
  id: number;
  domini: string;
  tipus: string;
  text: string;
  necessitatId: number | null;
  generadaPerIa: boolean;
  /** Spanish / English wording, when present. */
  textEs?: string | null;
  textEn?: string | null;
}

export function createNecessitat(input: {
  textNl: string;
  collectiuId: number | null;
  duradaMaxS?: number | null;
  /** Questions per person; NULL keeps the old "as the AI sees fit" behaviour. */
  questionCount?: number | null;
  /** 'daily' (default) joins the daily set; 'campaign' is a one-off extra set. */
  delivery?: QueryDelivery;
  context?: string | null;
  exclusions?: string | null;
}): number {
  const r = getDb()
    .prepare("INSERT INTO necessitat (text_nl, collectiu_id, durada_max_s, question_count, delivery, context, exclusions) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(input.textNl, input.collectiuId, input.duradaMaxS ?? null, input.questionCount ?? null, input.delivery ?? "daily", input.context || null, input.exclusions || null);
  return Number(r.lastInsertRowid);
}

// TEMPORARY (C3): question types in the DB are still the Catalan ones. Natan's branch renames them to English
// (scale5, scale10, yes_no, pair, choice, ranking, open). Delete these two maps and use the type names directly after the sync.
// The DB stores the same English types the AI uses (C2); these maps only reject types the AI may not draft.
const TIPUS_FROM_AI: Record<string, string> = { scale5: "scale5", scale10: "scale10", yes_no: "yes_no", open: "open", ranking: "ranking" };
const TIPUS_TO_AI: Record<string, string> = TIPUS_FROM_AI;

export interface DraftInput {
  text: string;
  type: string; // English type from @damm/ai
  domain: string; // domain name
  reason: string;
  /** Spanish / English wording proposed by the AI or edited by HR. Catalan `text` is canonical. */
  i18n?: { es?: { text: string }; en?: { text: string } };
}

/** `pregunta.text_i18n` JSON for a Catalan text plus optional es/en; null when there is nothing to add (readers fall back to `text`). */
function textI18nJson(ca: string, es?: string | null, en?: string | null): string | null {
  const e = es?.trim();
  const n = en?.trim();
  return e || n ? JSON.stringify({ ca, ...(e ? { es: e } : {}), ...(n ? { en: n } : {}) }) : null;
}

function insertDraft(necessitatId: number, collectiuId: number | null, q: DraftInput, ordre: number, byIa: boolean): void {
  const db = getDb();
  const dom = db.prepare("SELECT id FROM domini WHERE nom = ?").get(q.domain) as { id: number } | undefined;
  const tipus = TIPUS_FROM_AI[q.type];
  if (!dom || !tipus) throw new Error(`Unknown domain or type: ${q.domain} / ${q.type}`);
  db.prepare(
    `INSERT INTO pregunta (domini_id, collectiu_id, text, text_i18n, tipus, necessitat_id, generada_per_ia, motiu, ordre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(dom.id, collectiuId, q.text, textI18nJson(q.text, q.i18n?.es?.text, q.i18n?.en?.text), tipus, necessitatId, byIa ? 1 : 0, q.reason, ordre);
}

/** Store an AI (or fallback) survey as draft questions of a need. Nothing is approved here. */
export function saveDraftSurvey(
  necessitatId: number,
  survey: { title: string; intro: string; source: "llm" | "fallback"; questions: DraftInput[] },
): void {
  const db = getDb();
  const n = db.prepare("SELECT collectiu_id AS c FROM necessitat WHERE id = ?").get(necessitatId) as { c: number | null } | undefined;
  if (!n) throw new Error("Necessitat not found");
  db.transaction(() => {
    db.prepare("UPDATE necessitat SET titol = ?, intro = ?, draft_font = ? WHERE id = ?").run(
      survey.title, survey.intro, survey.source, necessitatId,
    );
    survey.questions.forEach((q, i) => insertDraft(necessitatId, n.c, q, i + 1, survey.source === "llm"));
  })();
}

export function updateNeedHeader(id: number, titol: string, intro: string): void {
  getDb().prepare("UPDATE necessitat SET titol = ?, intro = ? WHERE id = ?").run(titol, intro, id);
}

export interface NeedDraftGroup {
  id: number;
  textNl: string;
  titol: string | null;
  intro: string | null;
  duradaMaxS: number | null;
  questionCount: number | null;
  delivery: QueryDelivery;
  draftFont: "llm" | "fallback" | null;
  collectiu: string | null;
  /** Topics the need says must not be asked about (free text), for the wording check. */
  exclusions: string | null;
  questions: (DraftQuestion & { motiu: string | null; ordre: number; tipusAi: string })[];
}

/** Draft questions grouped by need, in review order. */
export function listNeedDrafts(): NeedDraftGroup[] {
  const db = getDb();
  const needs = db
    .prepare(
      `SELECT n.id, n.text_nl AS textNl, n.titol, n.intro, n.durada_max_s AS duradaMaxS, n.question_count AS questionCount, n.delivery, n.draft_font AS draftFont, n.exclusions, c.nom AS collectiu
       FROM necessitat n LEFT JOIN collectiu c ON c.id = n.collectiu_id
       WHERE EXISTS (SELECT 1 FROM pregunta p WHERE p.necessitat_id = n.id AND p.estat = 'draft')
       ORDER BY n.id DESC`,
    )
    .all() as Omit<NeedDraftGroup, "questions">[];
  const qs = db.prepare(
    `SELECT p.id, d.nom AS domini, p.tipus, p.text, p.text_i18n AS ti, p.necessitat_id AS necessitatId, p.generada_per_ia AS ia, p.motiu, p.ordre
     FROM pregunta p JOIN domini d ON d.id = p.domini_id
     WHERE p.estat = 'draft' AND p.necessitat_id = ? ORDER BY p.ordre, p.id`,
  );
  return needs.map((n) => ({
    ...n,
    questions: (qs.all(n.id) as any[]).map((r) => ({
      id: r.id, domini: r.domini, tipus: r.tipus, text: r.text, necessitatId: r.necessitatId,
      generadaPerIa: !!r.ia, motiu: r.motiu, ordre: r.ordre, tipusAi: TIPUS_TO_AI[r.tipus] ?? r.tipus,
      textEs: parseTr(r.ti)?.es ?? null, textEn: parseTr(r.ti)?.en ?? null,
    })),
  }));
}

function parseTr(raw: string | null): { es?: string; en?: string } | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Move a draft one position up or down among the drafts of its need. */
export function moveDraft(id: number, dir: "up" | "down"): void {
  const db = getDb();
  const q = db.prepare("SELECT necessitat_id AS n FROM pregunta WHERE id = ? AND estat = 'draft'").get(id) as { n: number | null } | undefined;
  if (!q?.n) return;
  db.transaction(() => {
    const ids = (db.prepare("SELECT id FROM pregunta WHERE necessitat_id = ? AND estat = 'draft' ORDER BY ordre, id").all(q.n) as { id: number }[]).map((r) => r.id);
    const i = ids.indexOf(id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const set = db.prepare("UPDATE pregunta SET ordre = ? WHERE id = ?");
    ids.forEach((x, k) => set.run(k + 1, x));
  })();
}

/** Everything the AI needs to propose another wording for one draft. */
export function getRedraftContext(id: number) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.id, p.text, p.tipus, d.nom AS domini, p.motiu, p.necessitat_id AS nid,
              n.text_nl AS objective, n.context, n.exclusions, n.durada_max_s AS maxSeconds, n.question_count AS questionCount, c.nom AS collective
       FROM pregunta p JOIN domini d ON d.id = p.domini_id
       JOIN necessitat n ON n.id = p.necessitat_id LEFT JOIN collectiu c ON c.id = n.collectiu_id
       WHERE p.id = ? AND p.estat = 'draft'`,
    )
    .get(id) as any;
  if (!row) return null;
  const others = (db
    .prepare(
      `SELECT p.text, p.tipus, d.nom AS domini, p.motiu FROM pregunta p JOIN domini d ON d.id = p.domini_id
       WHERE p.necessitat_id = ? AND p.estat = 'draft' AND p.id <> ? ORDER BY p.ordre, p.id`,
    )
    .all(row.nid, id) as any[]).map((o) => ({ text: o.text, type: TIPUS_TO_AI[o.tipus] ?? o.tipus, domain: o.domini, reason: o.motiu ?? "" }));
  return {
    need: { objective: row.objective, context: row.context, exclusions: row.exclusions, collective: row.collective, maxSeconds: row.maxSeconds, questionCount: row.questionCount },
    current: { text: row.text, type: TIPUS_TO_AI[row.tipus] ?? row.tipus, domain: row.domini, reason: row.motiu ?? "" },
    others,
  };
}

/** Replace the wording of a draft in place (same row, same position). Still a draft: a human approves later. */
export function replaceDraft(id: number, q: DraftInput, byIa: boolean): void {
  const db = getDb();
  const dom = db.prepare("SELECT id FROM domini WHERE nom = ?").get(q.domain) as { id: number } | undefined;
  const tipus = TIPUS_FROM_AI[q.type];
  if (!dom || !tipus) throw new Error(`Unknown domain or type: ${q.domain} / ${q.type}`);
  db.prepare(
    "UPDATE pregunta SET text = ?, text_i18n = ?, tipus = ?, domini_id = ?, motiu = ?, generada_per_ia = ? WHERE id = ? AND estat = 'draft'",
  ).run(q.text, textI18nJson(q.text, q.i18n?.es?.text, q.i18n?.en?.text), tipus, dom.id, q.reason, byIa ? 1 : 0, id);
}

export function listCollectius(): { id: number; nom: string }[] {
  return getDb().prepare("SELECT id, nom FROM collectiu ORDER BY id").all() as { id: number; nom: string }[];
}

export function listDomains(): { id: number; nom: string }[] {
  return getDb().prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
}

export function listTorns(): { id: number; nom: string }[] {
  return getDb().prepare("SELECT id, nom FROM torn ORDER BY id").all() as { id: number; nom: string }[];
}

export function listDrafts(): DraftQuestion[] {
  return getDb()
    .prepare(
      `SELECT p.id, d.nom AS domini, p.tipus, p.text, p.necessitat_id AS necessitatId, p.generada_per_ia AS ia
       FROM pregunta p JOIN domini d ON d.id = p.domini_id
       WHERE p.estat = 'draft' ORDER BY p.id`,
    )
    .all()
    .map((r: any) => ({ ...r, generadaPerIa: !!r.ia }));
}

/** HR edit of a draft: Catalan text plus the Spanish and English wording (empty means "fall back to Catalan"). */
export function updateDraftText(id: number, text: string, es?: string | null, en?: string | null): void {
  getDb().prepare("UPDATE pregunta SET text = ?, text_i18n = ? WHERE id = ? AND estat = 'draft'").run(text, textI18nJson(text, es, en), id);
}

/** Catalan text and the stored es/en wording of a question (empty string = missing). */
export function getQuestionWording(id: number): { text: string; es: string; en: string } | null {
  const r = getDb().prepare("SELECT text, text_i18n AS ti FROM pregunta WHERE id = ?").get(id) as { text: string; ti: string | null } | undefined;
  if (!r) return null;
  let v: Record<string, unknown> = {};
  try {
    v = r.ti ? JSON.parse(r.ti) : {};
  } catch {
    /* malformed: treated as missing */
  }
  const g = (k: string) => (typeof v?.[k] === "string" ? (v[k] as string).trim() : "");
  return { text: r.text, es: g("es"), en: g("en") };
}

/** Fills the missing es/en wording of a question of any state; existing es/en are never overwritten (HR edits win). */
export function fillQuestionTranslations(id: number, es: string | null, en: string | null): void {
  const w = getQuestionWording(id);
  if (!w) return;
  getDb().prepare("UPDATE pregunta SET text_i18n = ? WHERE id = ?").run(textI18nJson(w.text, w.es || es, w.en || en), id);
}

/** Human approval: the only code path that sets estat = 'aprovada'. */
export function approveQuestion(id: number, approvedBy: string): void {
  getDb()
    .prepare(
      `UPDATE pregunta SET estat = 'aprovada', prioritat = CASE WHEN necessitat_id IS NULL THEN prioritat ELSE 100 END,
       aprovada_per = ?, aprovada_el = datetime('now') WHERE id = ? AND estat = 'draft'`,
    )
    .run(approvedBy, id);
}

export function discardQuestion(id: number): void {
  getDb().prepare("UPDATE pregunta SET estat = 'retirada' WHERE id = ? AND estat = 'draft'").run(id);
}

export function listApprovedUnpublishedNeeds(): { id: number; textNl: string; approved: number }[] {
  return getDb()
    .prepare(
      `SELECT n.id, n.text_nl AS textNl, COUNT(p.id) AS approved
       FROM necessitat n JOIN pregunta p ON p.necessitat_id = n.id AND p.estat = 'aprovada'
       WHERE n.estat = 'oberta' GROUP BY n.id`,
    )
    .all() as { id: number; textNl: string; approved: number }[];
}

/**
 * Publish = the need's approved questions (already estat = 'aprovada', top priority) go live in
 * the pool for its collective, or for every collective when it has none. No join code or link is
 * created: onboarding codes are per collective (/hr/publish). The web layer then sends a push
 * notification through the employee side and gets back an aggregate count only.
 * Returns false when the need does not exist or has no approved question.
 */
export function publishNecessitat(necessitatId: number): boolean {
  const db = getDb();
  const ok = db
    .prepare(
      `UPDATE necessitat SET estat = 'publicada' WHERE id = ? AND estat = 'oberta'
       AND EXISTS (SELECT 1 FROM pregunta p WHERE p.necessitat_id = necessitat.id AND p.estat = 'aprovada')`,
    )
    .run(necessitatId);
  return ok.changes > 0;
}

export function listPublications() {
  return getDb()
    .prepare(
      `SELECT pu.id, pu.codi_join AS codi, pu.qr_url AS url, n.text_nl AS textNl, c.nom AS collectiu
       FROM publicacio pu JOIN necessitat n ON n.id = pu.necessitat_id
       JOIN joincode j ON j.codi = pu.codi_join JOIN collectiu c ON c.id = j.collectiu_id
       ORDER BY pu.id DESC`,
    )
    .all() as { id: number; codi: string; url: string; textNl: string; collectiu: string }[];
}

export interface AggregateRow extends Omit<Agregat, "collectiuId" | "tornId" | "dominiId" | "n" | "mitjana"> {
  collectiu: string | null;
  torn: string | null;
  domini: string | null;
  n: number | null; // null when suppressed
  mitjana: number | null; // null when suppressed
  precisio: PrecisionBand | null;
  motiu: HideReason;
}

/** Suppression is re-enforced on read, whatever the job wrote. Complementary suppression is applied per parent. */
export function listAggregates(): AggregateRow[] {
  const rows = (getDb()
    .prepare(
      `SELECT a.periode, c.nom AS collectiu, t.nom AS torn, d.nom AS domini, a.n, a.mitjana, a.suprimit
       FROM agregat a LEFT JOIN collectiu c ON c.id = a.collectiu_id
       LEFT JOIN torn t ON t.id = a.torn_id LEFT JOIN domini d ON d.id = a.domini_id
       ORDER BY a.periode DESC, c.nom, t.nom, d.nom`,
    )
    .all() as any[]);
  // Siblings: shifts share (periode, collectiu, domini); collectives share (periode, domini). Totals have no siblings.
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const key = r.torn ? `t|${r.periode}|${r.collectiu}|${r.domini}` : r.collectiu ? `c|${r.periode}|${r.domini}` : `x|${i}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const reason: HideReason[] = new Array(rows.length).fill(null);
  for (const idx of groups.values()) {
    const res = complementarySuppression(idx.map((i) => ({ n: rows[i].n, primary: !!rows[i].suprimit })));
    idx.forEach((i, k) => (reason[i] = res[k]));
  }
  return rows.map((r, i) => {
    const hidden = reason[i] !== null;
    return {
      ...r, suprimit: hidden, motiu: reason[i],
      n: hidden ? null : r.n, mitjana: hidden ? null : r.mitjana,
      precisio: hidden ? null : precisionBand(r.n),
    };
  });
}

export function listSignals(): (Omit<Senyal, "collectiuId"> & { collectiu: string | null; domini: string | null; torn: string | null })[] {
  return (getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, c.nom AS collectiu, d.nom AS domini, t.nom AS torn,
              s.periode, s.n, s.confianca, s.suprimit, s.severity, s.status
       FROM senyal s
       LEFT JOIN collectiu c ON c.id = s.collectiu_id
       LEFT JOIN domini d ON d.id = s.domini_id
       LEFT JOIN torn t ON t.id = s.torn_id
       ORDER BY s.n DESC`,
    )
    .all() as any[])
    .filter((r) => r.n >= MIN_GROUP_SIZE && !r.suprimit)
    .map((r) => ({ ...r, suprimit: false }));
}

/** SQL column list that maps `recomanacio` onto `SignalRecommendation`. */
export const RECOMMENDATION_COLUMNS = `id, text, estat, seguiment_necessitat_id AS seguimentNecessitatId, titol, iniciativa,
  responsable_suggerit AS responsableSuggerit, termini_suggerit AS terminiSuggerit, justificacio, limits, font, aprovada_el AS aprovadaEl, aprovada_per AS aprovadaPer`;

type RecommendationRow = Recomanacio & Omit<SignalRecommendation, "id" | "text" | "estat" | "seguimentNecessitatId">;

export function listRecommendations(lang?: Lang): RecommendationRow[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT senyal_id AS senyalId, ${RECOMMENDATION_COLUMNS} FROM recomanacio ORDER BY id`)
    .all() as RecommendationRow[];
  return overlayTranslations(db, "recomanacio", rows, RECOMMENDATION_FIELDS, lang);
}

/** Recommendations still waiting for a human decision (badge in the HR sidebar). */
export function countPendingRecommendations(): number {
  const r = getDb().prepare(`SELECT COUNT(*) AS n FROM recomanacio WHERE estat = 'proposada'`).get() as { n: number };
  return r.n;
}

// --- Manager view reads (read-only, one collective, aggregates only) -------------------

export interface ManagerSignal {
  id: number;
  tipus: string;
  descripcio: string;
  domini: string | null;
  torn: string | null;
  periode: string;
  n: number;
  severity: string;
}

/** Signals a manager may see for one collective: audience `hr_manager` only (Lideratge alarms are `hr`), n >= minimum group size, not suppressed. */
export function listManagerSignals(collectiuId: number): ManagerSignal[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, d.nom AS domini, t.nom AS torn, s.periode, s.n, s.severity
       FROM senyal s
       LEFT JOIN domini d ON d.id = s.domini_id
       LEFT JOIN torn t ON t.id = s.torn_id
       WHERE s.collectiu_id = ? AND s.audience = 'hr_manager' AND s.suprimit = 0 AND s.n >= ?
       ORDER BY s.periode DESC, s.n DESC`,
    )
    .all(collectiuId, MIN_GROUP_SIZE) as ManagerSignal[];
}

/** Recommendations a human at HR approved, tied to a signal a manager may see for this collective. Never proposed or discarded ones. */
export function listManagerRecommendations(collectiuId: number, lang?: Lang): { id: number; text: string; seguiment: boolean }[] {
  const db = getDb();
  const rows = (db
    .prepare(
      `SELECT r.id, r.text, r.seguiment_necessitat_id AS seg FROM recomanacio r
       JOIN senyal s ON s.id = r.senyal_id
       WHERE r.estat = 'aprovada' AND s.collectiu_id = ? AND s.audience = 'hr_manager' AND s.suprimit = 0 AND s.n >= ?
       ORDER BY r.id`,
    )
    .all(collectiuId, MIN_GROUP_SIZE) as { id: number; text: string; seg: number | null }[])
    .map((r) => ({ id: r.id, text: r.text, seguiment: r.seg !== null }));
  return overlayTranslations(db, "recomanacio", rows, { text: "text" }, lang);
}

/** Non-personal approver label: control characters and "@" stripped (no emails), max 60 chars, "HR" when empty. */
export function approverLabel(raw: unknown): string {
  const v = String(raw ?? "").replace(/[\u0000-\u001f\u007f@]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return v || "HR";
}

/** Human approval of a recommendation. Records a non-personal label (what HR typed, or "HR") and the time (R-X-3). */
export function approveRecommendation(id: number, approvedBy?: string): void {
  getDb()
    .prepare("UPDATE recomanacio SET estat = 'aprovada', aprovada_el = datetime('now'), aprovada_per = ? WHERE id = ? AND estat = 'proposada'")
    .run(approverLabel(approvedBy), id);
  linkSignalOfRecommendation(id);
}

export interface ContextEvent {
  id: number;
  date: string; // YYYY-MM-DD
  collectiuId: number | null;
  tornId: number | null;
  dominiId: number | null;
  label: string;
  createdAt: string;
}

/** Records something that happened (a new shift system, a reorganisation). With a domain it anchors a "since" before/after comparison. */
export function addContextEvent(e: { date: string; label: string; collectiuId?: number | null; tornId?: number | null; dominiId?: number | null }): number {
  const label = e.label.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || Number.isNaN(Date.parse(`${e.date}T00:00:00Z`))) throw new Error("date must be YYYY-MM-DD");
  if (!label) throw new Error("label is required");
  const res = getDb()
    .prepare("INSERT INTO context_event (event_date, collectiu_id, torn_id, domini_id, label) VALUES (?,?,?,?,?)")
    .run(e.date, e.collectiuId ?? null, e.tornId ?? null, e.dominiId ?? null, label);
  return Number(res.lastInsertRowid);
}

export function listContextEvents(): ContextEvent[] {
  return (
    getDb()
      .prepare("SELECT id, event_date, collectiu_id, torn_id, domini_id, label, created_at FROM context_event ORDER BY event_date DESC, id DESC")
      .all() as { id: number; event_date: string; collectiu_id: number | null; torn_id: number | null; domini_id: number | null; label: string; created_at: string }[]
  ).map((r) => ({ id: r.id, date: r.event_date, collectiuId: r.collectiu_id, tornId: r.torn_id, dominiId: r.domini_id, label: r.label, createdAt: r.created_at }));
}

export function discardRecommendation(id: number): void {
  getDb().prepare("UPDATE recomanacio SET estat = 'descartada' WHERE id = ? AND estat = 'proposada'").run(id);
}

export const SIGNAL_STATUSES = ["open", "acknowledged", "action_linked", "resolved", "dismissed"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/** Human action: move a signal through open → acknowledged → action_linked → resolved (any order, schema enum only). */
export function setSignalStatus(id: number, status: string): boolean {
  if (!(SIGNAL_STATUSES as readonly string[]).includes(status)) return false;
  return getDb().prepare("UPDATE senyal SET status = ? WHERE id = ?").run(status, id).changes > 0;
}

const AUTO_ORDER = ["open", "acknowledged", "action_linked"] as const;

/**
 * Automatic status step: only moves a signal forward along open → acknowledged → action_linked.
 * Never moves backwards and never touches a resolved or dismissed signal. Returns true when it changed.
 */
export function advanceSignalStatus(id: number, target: "acknowledged" | "action_linked"): boolean {
  const db = getDb();
  const row = db.prepare("SELECT status FROM senyal WHERE id = ?").get(id) as { status: string } | undefined;
  if (!row) return false;
  const cur = (AUTO_ORDER as readonly string[]).indexOf(row.status);
  if (cur < 0 || cur >= (AUTO_ORDER as readonly string[]).indexOf(target)) return false;
  return db.prepare("UPDATE senyal SET status = ? WHERE id = ?").run(target, id).changes > 0;
}

/** A recommendation was approved or got a follow-up: its signal now has an action linked. */
export function linkSignalOfRecommendation(recId: number): void {
  const r = getDb().prepare("SELECT senyal_id AS s FROM recomanacio WHERE id = ?").get(recId) as { s: number | null } | undefined;
  if (r?.s) advanceSignalStatus(r.s, "action_linked");
}

/** Human action: close a need (necessitat.estat = 'tancada'). Its published questions stay in the DB; no new publication. */
export function closeNecessitat(id: number): boolean {
  return getDb().prepare("UPDATE necessitat SET estat = 'tancada' WHERE id = ? AND estat <> 'tancada'").run(id).changes > 0;
}

export function listNeeds(): { id: number; textNl: string; estat: string; collectiu: string | null }[] {
  return getDb()
    .prepare(
      `SELECT n.id, n.text_nl AS textNl, n.estat, c.nom AS collectiu FROM necessitat n
       LEFT JOIN collectiu c ON c.id = n.collectiu_id ORDER BY (n.estat = 'tancada'), n.id DESC`,
    )
    .all() as { id: number; textNl: string; estat: string; collectiu: string | null }[];
}

export type NeedState = "esborrany" | "llesta" | "publicada" | "tancada";

export interface NeedCard {
  id: number;
  textNl: string;
  titol: string | null;
  intro: string | null;
  collectiu: string | null;
  duradaMaxS: number | null;
  questionCount: number | null;
  delivery: QueryDelivery;
  draftFont: "llm" | "fallback" | null;
  creat: string;
  /** Card state shown on the Necessitats page, derived from necessitat.estat and the question states. */
  state: NeedState;
  nDraft: number;
  approved: { id: number; domini: string; tipus: string; text: string; /** Answers so far; null when under the minimum group size. */ answers: number | null }[];
  publications: { id: number; codi: string; url: string; collectiu: string; creat: string }[];
  /** Date of the first publication (join code) row; null when none was recorded. */
  publicat: string | null;
  /** Most answers any one question has, i.e. a lower bound of respondents. Null when under the minimum group size. */
  responses: number | null;
  /** Synthetic population of the target collective (whole company when the need has none). */
  population: number;
}

/**
 * Read-only: every need with its card state, approved questions and publications (join codes), newest first.
 * Esborrany = still has draft questions (or none yet); Llesta = open with approved questions and no drafts left;
 * Publicada / Tancada follow necessitat.estat. Reads only needs, questions and publications: no responses, no accounts.
 */
export function listNeedCards(lang?: Lang): NeedCard[] {
  const db = getDb();
  const needs = db
    .prepare(
      `SELECT n.id, n.text_nl AS textNl, n.titol, n.intro, n.durada_max_s AS duradaMaxS, n.question_count AS questionCount, n.delivery, n.draft_font AS draftFont,
              n.creat, n.estat, c.nom AS collectiu,
              (SELECT COUNT(*) FROM pregunta p WHERE p.necessitat_id = n.id AND p.estat = 'draft') AS nDraft
       FROM necessitat n LEFT JOIN collectiu c ON c.id = n.collectiu_id
       ORDER BY n.id DESC`,
    )
    .all() as (Omit<NeedCard, "state" | "approved" | "publications" | "publicat" | "responses" | "population"> & { estat: string })[];
  const approved = db.prepare(
    `SELECT p.id, d.nom AS domini, p.tipus, p.text FROM pregunta p JOIN domini d ON d.id = p.domini_id
     WHERE p.necessitat_id = ? AND p.estat = 'aprovada' ORDER BY p.ordre, p.id`,
  );
  const answerCount = db.prepare("SELECT COUNT(*) AS n FROM v_resposta_analitica WHERE pregunta_id = ?");
  const popAll = (db.prepare("SELECT COUNT(*) AS n FROM empleat_sintetic").get() as { n: number }).n;
  const popOf = db.prepare("SELECT COUNT(*) AS n FROM empleat_sintetic es JOIN collectiu c ON c.id = es.collectiu_id WHERE c.nom = ?");
  const pubs = db.prepare(
    `SELECT pu.id, pu.codi_join AS codi, pu.qr_url AS url, c.nom AS collectiu, pu.creat
     FROM publicacio pu JOIN joincode j ON j.codi = pu.codi_join JOIN collectiu c ON c.id = j.collectiu_id
     WHERE pu.necessitat_id = ? ORDER BY pu.id`,
  );
  overlayTranslations(db, "necessitat", needs as unknown as { id: number; textNl: string; titol: string | null; intro: string | null }[],
    { text_nl: "textNl", titol: "titol", intro: "intro" }, lang);
  return needs.map(({ estat, ...n }) => {
    const ap = (approved.all(n.id) as Omit<NeedCard["approved"][number], "answers">[]).map((q) => {
      const c = (answerCount.get(q.id) as { n: number }).n;
      return { ...q, answers: c >= MIN_GROUP_SIZE ? c : null };
    });
    const most = Math.max(0, ...ap.map((q) => (answerCount.get(q.id) as { n: number }).n));
    const pubList = pubs.all(n.id) as NeedCard["publications"];
    const state: NeedState =
      estat === "tancada" ? "tancada" : estat === "publicada" ? "publicada" : n.nDraft === 0 && ap.length > 0 ? "llesta" : "esborrany";
    return {
      ...n,
      state,
      approved: ap,
      publications: pubList,
      publicat: pubList[0]?.creat ?? null,
      responses: most >= MIN_GROUP_SIZE ? most : null,
      population: n.collectiu ? (popOf.get(n.collectiu) as { n: number }).n : popAll,
    };
  });
}

export interface FollowUpNeed {
  id: number;
  objective: string;
  context: string;
  collective: string | null;
  maxSeconds: number;
}

/**
 * Follow-up survey: a new open need linked to an approved recommendation, scoped to the signal's collective.
 * Returns the need only when it was created now, so the caller drafts its questions once (the AI layer drafts them).
 */
export function createFollowUp(recId: number): FollowUpNeed | null {
  const db = getDb();
  const r = db
    .prepare(
      `SELECT r.text, r.estat, r.seguiment_necessitat_id AS s, s.descripcio, s.collectiu_id AS c, c.nom AS collectiu
       FROM recomanacio r LEFT JOIN senyal s ON s.id = r.senyal_id LEFT JOIN collectiu c ON c.id = s.collectiu_id
       WHERE r.id = ?`,
    )
    .get(recId) as
    | { text: string; estat: string; s: number | null; descripcio: string | null; c: number | null; collectiu: string | null }
    | undefined;
  if (!r || r.estat !== "aprovada" || r.s) return null;
  const objective = `Seguiment: comprovar si l'acció aprovada ha funcionat. Acció: ${r.text}`;
  const context = r.descripcio ? `Senyal d'origen: ${r.descripcio}` : "";
  const maxSeconds = 60;
  const id = db.transaction(() => {
    const nid = createNecessitat({ textNl: `Seguiment: ${r.text}`, collectiuId: r.c, duradaMaxS: maxSeconds, context });
    db.prepare("UPDATE recomanacio SET seguiment_necessitat_id = ? WHERE id = ?").run(nid, recId);
    return nid;
  })();
  return { id, objective, context, collective: r.collectiu, maxSeconds };
}

/** Admin view: account counts per collective only. `comptes` is null (shown as "<10") under the minimum group size. */
export function accountCounts(): { collectiu: string; comptes: number | null }[] {
  return (getDb()
    .prepare(
      `SELECT c.nom AS collectiu, COUNT(k.id) AS comptes FROM collectiu c
       LEFT JOIN compte k ON k.collectiu_id = c.id AND k.id NOT LIKE 'deleted:%' GROUP BY c.id ORDER BY c.id`,
    )
    .all() as { collectiu: string; comptes: number }[]).map((r) => ({ ...r, comptes: r.comptes < MIN_GROUP_SIZE ? null : r.comptes }));
}

// --- Results dashboard reads (aggregates + synthetic population only) ------------------

export interface RepRow {
  collectiu: string;
  torn: string | null;
  suprimit: boolean;
  motiu: HideReason;
  respondents: number | null; // null when suppressed
  respShare: number | null; // 0..1, among visible segments of the same group
  popShare: number | null;
  gap: number | null; // respShare - popShare
}

export interface Representativeness {
  periode: string | null;
  collectius: RepRow[];
  torns: RepRow[];
}

interface RepItem { collectiu: string; torn: string | null; resp: number; pop: number; hidden: boolean }

/** Primary hiding (small, flagged, no row or tiny population), then complementary suppression among the siblings. */
function buildRep(items: RepItem[]): RepRow[] {
  const primary = items.map((i) => i.hidden || i.resp < MIN_GROUP_SIZE || i.pop < MIN_GROUP_SIZE);
  const reasons = complementarySuppression(
    items.map((i, k) => ({ n: i.hidden && i.resp === 0 ? null : i.resp, primary: primary[k] })),
  ).map((r, k) => (primary[k] && r === null ? ("primari" as const) : r));
  const visible = items.filter((_, k) => reasons[k] === null);
  const respTotal = visible.reduce((s, i) => s + i.resp, 0);
  const popTotal = visible.reduce((s, i) => s + i.pop, 0);
  return items.map((i, k) => {
    if (reasons[k] !== null) {
      return { collectiu: i.collectiu, torn: i.torn, suprimit: true, motiu: reasons[k], respondents: null, respShare: null, popShare: null, gap: null };
    }
    const respShare = i.resp / respTotal;
    const popShare = i.pop / popTotal;
    return { collectiu: i.collectiu, torn: i.torn, suprimit: false, motiu: null, respondents: i.resp, respShare, popShare, gap: respShare - popShare };
  });
}

/**
 * Latest period the HR pages may read: the newest one whose company-wide row clears the minimum group size.
 * A month that has just started (a handful of live answers) must not replace the last readable one, or every cell would be
 * suppressed. Falls back to the newest period when none clears it. Periods after this one are hidden from HR reads.
 */
export function readingPeriod(db: ReturnType<typeof getDb> = getDb()): string | null {
  const ok = db
    .prepare("SELECT MAX(periode) AS p FROM agregat WHERE collectiu_id IS NULL AND torn_id IS NULL AND suprimit = 0 AND n >= ?")
    .get(MIN_GROUP_SIZE) as { p: string | null };
  if (ok.p) return ok.p;
  return (db.prepare("SELECT MAX(periode) AS p FROM agregat").get() as { p: string | null }).p;
}

/**
 * Job step: when the newest period is too thin to read, the engine hides every open alarm (it evaluates only the
 * newest period). Restore the ones whose segment is still readable in the reading period, so a first answer of a
 * new month does not wipe the alarm list. Returns the number restored. Aggregates only.
 */
export function reinstateAlarmsForReadingPeriod(db: ReturnType<typeof getDb> = getDb()): number {
  const reading = readingPeriod(db);
  const newest = (db.prepare("SELECT MAX(periode) AS p FROM agregat").get() as { p: string | null }).p;
  if (!reading || reading === newest) return 0;
  // Alarms of one domain match that domain's aggregate; segment-wide alarms (domini_id NULL, e.g. low participation)
  // match any readable domain row of the segment and keep a NULL confidence.
  const r = db
    .prepare(
      `UPDATE senyal SET suprimit = 0,
         confianca = CASE WHEN domini_id IS NULL THEN NULL ELSE
           (SELECT a.confidence FROM agregat a WHERE a.periode = @p AND a.collectiu_id IS senyal.collectiu_id
              AND a.torn_id IS senyal.torn_id AND a.domini_id = senyal.domini_id AND a.suprimit = 0 AND a.n >= @min) END
       WHERE suprimit = 1 AND status = 'open' AND n >= @min AND EXISTS (
         SELECT 1 FROM agregat a WHERE a.periode = @p AND a.collectiu_id IS senyal.collectiu_id
           AND a.torn_id IS senyal.torn_id AND (senyal.domini_id IS NULL OR a.domini_id = senyal.domini_id)
           AND a.suprimit = 0 AND a.n >= @min)`,
    )
    .run({ p: reading, min: MIN_GROUP_SIZE });
  return r.changes;
}

/** Periods HR may read, oldest first (up to and including the reading period). */
function readablePeriods(db: ReturnType<typeof getDb>): string[] {
  const cap = readingPeriod(db);
  if (!cap) return [];
  return (db.prepare("SELECT DISTINCT periode FROM agregat WHERE periode <= ? ORDER BY periode").all(cap) as { periode: string }[]).map((r) => r.periode);
}

/**
 * Respondent counts per (collective, shift) for one period.
 * Prefers the all-domains rows (domini_id NULL). The engine writes per-domain rows only, so otherwise the largest
 * per-domain n of the segment is used. That is the number of people who answered at least one item of that domain, so it
 * is a lower bound of the distinct respondents of the segment, never an over-count.
 */
function segmentCounts(db: ReturnType<typeof getDb>, periode: string): { c: number; t: number | null; n: number; suprimit: number }[] {
  const all = db
    .prepare(
      `SELECT collectiu_id AS c, torn_id AS t, domini_id AS d, n FROM agregat
       WHERE periode = ? AND collectiu_id IS NOT NULL`,
    )
    .all(periode) as { c: number; t: number | null; d: number | null; n: number }[];
  const best = new Map<string, { c: number; t: number | null; n: number; whole: boolean }>();
  for (const r of all) {
    const k = `${r.c}|${r.t}`;
    const cur = best.get(k);
    const whole = r.d === null;
    if (!cur || (whole && !cur.whole) || (whole === cur.whole && r.n > cur.n)) best.set(k, { c: r.c, t: r.t, n: r.n, whole });
  }
  return [...best.values()].map((b) => ({ c: b.c, t: b.t, n: b.n, suprimit: b.n < MIN_GROUP_SIZE ? 1 : 0 }));
}

/** Response share vs synthetic population share for the latest period. Shares are computed among visible segments only, so suppressed counts cannot be recovered by subtraction. */
export function getRepresentativeness(): Representativeness {
  const db = getDb();
  const p = { p: readingPeriod(db) };
  if (!p.p) return { periode: null, collectius: [], torns: [] };
  const cols = listCollectius();
  const torns = db.prepare("SELECT id, nom FROM torn ORDER BY id").all() as { id: number; nom: string }[];
  const pop = db
    .prepare("SELECT collectiu_id AS c, torn_id AS t, COUNT(*) AS n FROM empleat_sintetic GROUP BY collectiu_id, torn_id")
    .all() as { c: number; t: number | null; n: number }[];
  const resp = segmentCounts(db, p.p);

  const popC = (c: number) => pop.filter((x) => x.c === c).reduce((s, x) => s + x.n, 0);
  const collectius = buildRep(
    cols.map((c) => {
      const r = resp.find((x) => x.c === c.id && x.t === null);
      return { collectiu: c.nom, torn: null, resp: r?.n ?? 0, pop: popC(c.id), hidden: !r || !!r.suprimit };
    }),
  );

  const shiftRows: RepRow[] = [];
  for (const c of cols) {
    const shifts = torns.filter((t) => pop.some((x) => x.c === c.id && x.t === t.id));
    if (!shifts.length) continue;
    shiftRows.push(
      ...buildRep(
        shifts.map((t) => {
          const r = resp.find((x) => x.c === c.id && x.t === t.id);
          const n = pop.find((x) => x.c === c.id && x.t === t.id)?.n ?? 0;
          return { collectiu: c.nom, torn: t.nom, resp: r?.n ?? 0, pop: n, hidden: !r || !!r.suprimit };
        }),
      ),
    );
  }
  return { periode: p.p, collectius, torns: shiftRows };
}

export interface TrendCell {
  mitjana: number | null;
  n: number | null; // null when suppressed
  precisio: PrecisionBand | null;
  suprimit: boolean;
  motiu: HideReason;
  consensus: number | null; // 0-100 (engine), higher = answers more alike; null when suppressed
  confidence: number | null; // 0-100 (engine), how sure the score is; null when suppressed
  sd: number | null; // population SD of the 1-5 scale answers; null when suppressed
}
export interface TrendRow { domini: string; cells: TrendCell[]; canvi: Change }
export interface TrendSeries {
  scope: string; // "Tots" or a collective name
  rows: TrendRow[];
}
export interface Trends { periodes: string[]; series: TrendSeries[] }

/** Population SD of 1-5 scale answers per `periode|collectiu id or null|domini id`, from the analytics view (no account ids). Callers must only expose it for cells that are not suppressed. */
function scaleSpread(): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT v.periode AS per, v.collectiu_id AS c, v.domini_id AS d, COUNT(*) AS n, AVG(v.valor_num) AS m, AVG(v.valor_num * v.valor_num) AS m2
       FROM v_resposta_analitica v JOIN pregunta p ON p.id = v.pregunta_id
       WHERE v.valor_num IS NOT NULL AND p.tipus = 'scale5'
       GROUP BY v.periode, v.collectiu_id, v.domini_id`,
    )
    .all() as { per: string; c: number; d: number; n: number; m: number; m2: number }[];
  const out = new Map<string, number>();
  const tot = new Map<string, { n: number; s: number; s2: number }>();
  for (const r of rows) {
    out.set(`${r.per}|${r.c}|${r.d}`, Math.sqrt(Math.max(0, r.m2 - r.m * r.m)));
    const k = `${r.per}|null|${r.d}`;
    const t = tot.get(k) ?? { n: 0, s: 0, s2: 0 };
    t.n += r.n; t.s += r.m * r.n; t.s2 += r.m2 * r.n;
    tot.set(k, t);
  }
  for (const [k, t] of tot) {
    const m = t.s / t.n;
    out.set(k, Math.sqrt(Math.max(0, t.s2 / t.n - m * m)));
  }
  return out;
}

/** Mean score per domain per period, overall and per collective. Suppression re-enforced on read, including complementary suppression of collectives under "Tots". */
export function getTrends(): Trends {
  const db = getDb();
  const periodes = readablePeriods(db);
  const doms = db.prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
  const rows = db
    .prepare(
      `SELECT periode, collectiu_id AS c, domini_id AS d, n, mitjana, consensus, confidence, suprimit FROM agregat
       WHERE torn_id IS NULL AND domini_id IS NOT NULL`,
    )
    .all() as { periode: string; c: number | null; d: number; n: number; mitjana: number | null; consensus: number | null; confidence: number | null; suprimit: number }[];
  const spread = scaleSpread();
  const cols = listCollectius();
  const scopes: { id: number | null; nom: string }[] = [{ id: null, nom: "Tots" }, ...cols.map((c) => ({ id: c.id, nom: c.nom }))];
  const find = (per: string, c: number | null, d: number) => rows.find((x) => x.periode === per && x.c === c && x.d === d);

  // reason[scope id|"all"][periode][domini]
  const reasonOf = new Map<string, HideReason>();
  for (const per of periodes) {
    for (const d of doms) {
      const total = find(per, null, d.id);
      if (total) reasonOf.set(`${per}|null|${d.id}`, total.n < MIN_GROUP_SIZE || total.suprimit ? "primari" : null);
      const present = cols.filter((c) => find(per, c.id, d.id));
      const res = complementarySuppression(present.map((c) => {
        const r = find(per, c.id, d.id)!;
        return { n: r.n, primary: !!r.suprimit };
      }));
      present.forEach((c, k) => reasonOf.set(`${per}|${c.id}|${d.id}`, res[k]));
    }
  }

  const series = scopes
    .map((s) => {
      const trendRows = doms.map((d): TrendRow => {
        const cells = periodes.map((per): TrendCell => {
          const r = find(per, s.id, d.id);
          if (!r) return { mitjana: null, n: null, precisio: null, suprimit: false, motiu: null, consensus: null, confidence: null, sd: null };
          const motiu = reasonOf.get(`${per}|${s.id}|${d.id}`) ?? null;
          if (motiu) return { mitjana: null, n: null, precisio: null, suprimit: true, motiu, consensus: null, confidence: null, sd: null };
          const sd = spread.get(`${per}|${s.id}|${d.id}`);
          return {
            mitjana: r.mitjana, n: r.n, precisio: precisionBand(r.n), suprimit: false, motiu: null,
            consensus: r.consensus, confidence: r.confidence, sd: sd === undefined || r.n < MIN_GROUP_SIZE ? null : +sd.toFixed(2),
          };
        });
        const last = cells.length - 1;
        return { domini: d.nom, cells, canvi: classifyChange(cells[last - 1], cells[last]) };
      });
      return { scope: s.nom, rows: trendRows };
    })
    .filter((s) => s.rows.some((r) => r.cells.some((c) => c.mitjana !== null || c.suprimit)));
  return { periodes, series };
}

/** Population SD of 1-5 scale answers per `periode|torn id|domini id` for one collective (analytics view, no account ids). */
function shiftSpread(collectiuId: number): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT v.periode AS per, v.torn_id AS t, v.domini_id AS d, AVG(v.valor_num) AS m, AVG(v.valor_num * v.valor_num) AS m2
       FROM v_resposta_analitica v JOIN pregunta p ON p.id = v.pregunta_id
       WHERE v.valor_num IS NOT NULL AND p.tipus = 'scale5' AND v.collectiu_id = ? AND v.torn_id IS NOT NULL
       GROUP BY v.periode, v.torn_id, v.domini_id`,
    )
    .all(collectiuId) as { per: string; t: number; d: number; m: number; m2: number }[];
  return new Map(rows.map((r) => [`${r.per}|${r.t}|${r.d}`, Math.sqrt(Math.max(0, r.m2 - r.m * r.m))]));
}

/**
 * Trend of one shift inside one collective (same rigour as getTrends: n < 10 hides, complementary suppression across
 * the collective's shifts). Null when the shift has no aggregate rows.
 */
export function getShiftTrend(collectiuId: number, tornId: number): { periodes: string[]; rows: TrendRow[] } | null {
  const db = getDb();
  const periodes = readablePeriods(db);
  const doms = db.prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
  const rows = db
    .prepare(
      `SELECT periode, torn_id AS t, domini_id AS d, n, mitjana, consensus, confidence, suprimit FROM agregat
       WHERE collectiu_id = ? AND torn_id IS NOT NULL AND domini_id IS NOT NULL`,
    )
    .all(collectiuId) as { periode: string; t: number; d: number; n: number; mitjana: number | null; consensus: number | null; confidence: number | null; suprimit: number }[];
  if (!rows.some((r) => r.t === tornId)) return null;
  const shifts = [...new Set(rows.map((r) => r.t))];
  const find = (per: string, t: number, d: number) => rows.find((x) => x.periode === per && x.t === t && x.d === d);
  const spread = shiftSpread(collectiuId);
  const trendRows = doms.map((d): TrendRow => {
    const cells = periodes.map((per): TrendCell => {
      const r = find(per, tornId, d.id);
      if (!r) return { mitjana: null, n: null, precisio: null, suprimit: false, motiu: null, consensus: null, confidence: null, sd: null };
      const present = shifts.filter((t) => find(per, t, d.id));
      const res = complementarySuppression(present.map((t) => {
        const x = find(per, t, d.id)!;
        return { n: x.n, primary: !!x.suprimit };
      }));
      const motiu = res[present.indexOf(tornId)] ?? null;
      if (motiu) return { mitjana: null, n: null, precisio: null, suprimit: true, motiu, consensus: null, confidence: null, sd: null };
      const sd = spread.get(`${per}|${tornId}|${d.id}`);
      return {
        mitjana: r.mitjana, n: r.n, precisio: precisionBand(r.n), suprimit: false, motiu: null,
        consensus: r.consensus, confidence: r.confidence, sd: sd === undefined || r.n < MIN_GROUP_SIZE ? null : +sd.toFixed(2),
      };
    });
    const last = cells.length - 1;
    return { domini: d.nom, cells, canvi: classifyChange(cells[last - 1], cells[last]) };
  });
  return { periodes, rows: trendRows };
}

export interface ThemeRow {
  id: number;
  etiqueta: string | null; // null when suppressed
  resum: string | null;
  periode: string;
  n: number | null;
  emergent: boolean;
  suprimit: boolean;
  /** null = company-wide row. */
  collectiuId: number | null;
  /** Share of that collective's comments in the period (0..1); null when suppressed. */
  share: number | null;
  font: "seed" | "rules" | "llm";
}

/**
 * Themes from the comment analysis (one row per theme x period x collective, docs/engine.md section 12).
 * Without `collectiuId` only the company-wide rows (collectiu_id IS NULL) are returned; pass a collective id for its rows.
 * Suppressed rows (suprimit = 1 or n below the minimum group size) carry no label, summary, n or share.
 */
export function listThemes(opts: { collectiuId?: number | null; lang?: Lang } = {}): ThemeRow[] {
  const col = opts.collectiuId ?? null;
  const db = getDb();
  const rows = (db
    .prepare(
      `SELECT id, etiqueta, resum, periode, n, emergent, suprimit, collectiu_id, share, font FROM tema
       WHERE collectiu_id IS ? AND periode <= ? ORDER BY periode DESC, emergent DESC, n DESC`,
    )
    .all(col, readingPeriod() ?? "") as any[]).map((r) => {
    const hidden = r.n < MIN_GROUP_SIZE || !!r.suprimit;
    return {
      id: r.id, periode: r.periode, emergent: !!r.emergent, suprimit: hidden,
      etiqueta: hidden ? null : r.etiqueta, resum: hidden ? null : r.resum, n: hidden ? null : r.n,
      collectiuId: r.collectiu_id ?? null, share: hidden ? null : r.share ?? null, font: r.font,
    };
  });
  return overlayTranslations(db, "tema", rows, { etiqueta: "etiqueta", resum: "resum" }, opts.lang);
}

// --- CSV export (aggregates only; same suppression as the results page) ----------------

function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the aggregates behind the results page. Suppressed segments carry no numbers and `suprimit=1`. */
export function exportResultsCsv(now: Date = new Date()): string {
  const header = ["tipus", "periode", "collectiu", "torn", "domini", "respondents", "resp_pct", "pop_pct", "diferencia_pp", "mitjana", "suprimit", "n", "precisio", "canvi"];
  const lines: (string | number | null)[][] = [header];
  const pct = (v: number | null) => (v === null ? null : +(v * 100).toFixed(1));

  const rep = getRepresentativeness();
  for (const [tipus, rows] of [["representativitat_collectiu", rep.collectius], ["representativitat_torn", rep.torns]] as const) {
    for (const r of rows) {
      const hide = r.suprimit;
      lines.push([
        tipus, rep.periode, r.collectiu, r.torn, null,
        hide ? null : r.respondents, hide ? null : pct(r.respShare), hide ? null : pct(r.popShare), hide ? null : pct(r.gap),
        null, hide ? 1 : 0, hide ? null : r.respondents, null, null,
      ]);
    }
  }

  const trends = getTrends();
  for (const s of trends.series) {
    for (const row of s.rows) {
      row.cells.forEach((c, i) => {
        const hide = c.suprimit || c.mitjana === null;
        if (!c.suprimit && c.mitjana === null) return; // no data for this cell
        const last = i === row.cells.length - 1;
        lines.push([
          "tendencia", trends.periodes[i], s.scope, null, row.domini, null, null, null, null,
          hide ? null : +c.mitjana!.toFixed(2), hide ? 1 : 0, hide ? null : c.n, hide ? null : c.precisio, last && !hide ? row.canvi.label : null,
        ]);
      });
    }
  }
  const meta = [
    "# Give a Damm · resultats agregats (dades sintètiques)",
    `# Període: ${rep.periode ?? "–"} (representativitat); tendències: ${trends.periodes.join(", ") || "–"}`,
    `# Generat: ${now.toISOString()}`,
    `# Mida mínima de grup: n >= ${MIN_GROUP_SIZE}`,
    `# Nota: els segments amb menys de ${MIN_GROUP_SIZE} persones que han respost, i els ocults per protegir-los (supressió complementària) no tenen valors i porten suprimit=1. Només dades agregades, mai valors individuals.`,
  ];
  return [...meta, ...lines.map((l) => l.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

// --- HR home overview (aggregates, counts and synthetic population only) ----------------

export interface PendingItem {
  kind: "draft" | "recomanacio";
  id: number;
  text: string;
}

export interface HrOverview {
  periode: string | null;
  population: number;
  respondents: number | null; // sum of visible collective segments in the latest period
  /** Population of the same visible collectives: the denominator of `participation`. */
  coveredPopulation: number | null;
  /** Collectives left out of both numerator and denominator (suppressed). */
  excludedCollectius: number;
  participation: number | null; // 0..1, respondents / coveredPopulation
  openNeeds: number;
  pendingDrafts: number;
  pendingRecommendations: number;
  signalCount: number;
  topSignals: ReturnType<typeof listSignals>;
  pending: PendingItem[];
}

/** Everything the HR home screen shows. Segments under the minimum group size never enter a sum. */
export function getHrOverview(): HrOverview {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  const population = count("SELECT COUNT(*) AS c FROM empleat_sintetic");
  const p = { p: readingPeriod(db) };
  let respondents: number | null = null;
  let coveredPopulation: number | null = null;
  let excludedCollectius = 0;
  if (p.p) {
    const rows = segmentCounts(db, p.p).filter((r) => r.t === null);
    const hide = complementarySuppression(rows.map((r) => ({ n: r.n, primary: !!r.suprimit })));
    const visible = rows.filter((_, k) => hide[k] === null);
    excludedCollectius = listCollectius().length - visible.length;
    if (visible.length) {
      // Same population on both sides: only collectives whose respondents are visible count in the denominator too.
      const popOf = db.prepare("SELECT COUNT(*) AS c FROM empleat_sintetic WHERE collectiu_id = ?");
      respondents = visible.reduce((s, r) => s + r.n, 0);
      coveredPopulation = visible.reduce((s, r) => s + (popOf.get(r.c) as { c: number }).c, 0);
    }
  }
  const signals = listSignals();
  const drafts = listDrafts();
  const recs = listRecommendations().filter((r) => r.estat === "proposada");
  return {
    periode: p.p,
    population,
    respondents,
    coveredPopulation,
    excludedCollectius,
    participation: respondents !== null && coveredPopulation ? respondents / coveredPopulation : null,
    openNeeds: count("SELECT COUNT(*) AS c FROM necessitat WHERE estat = 'oberta'"),
    pendingDrafts: drafts.length,
    pendingRecommendations: recs.length,
    signalCount: signals.length,
    topSignals: signals.slice(0, 3),
    pending: [
      ...drafts.map((d): PendingItem => ({ kind: "draft", id: d.id, text: d.text })),
      ...recs.map((r): PendingItem => ({ kind: "recomanacio", id: r.id, text: r.text })),
    ],
  };
}

// --- Publish page reads (join codes + account counts per collective; no identities) ----

export interface JoinCodeRow {
  codi: string;
  collectiu: string;
  actiu: boolean;
  /** Accounts of the whole collective (accounts are not tied to a code). Null: suppressed, or shown on the collective's first code only. */
  comptes: number | null;
  /** True when the collective total is under the minimum group size ("<10"). */
  comptesSuppressed: boolean;
  /** True on the one code per collective that carries the count. */
  showsCount: boolean;
}

export function listJoinCodes(): JoinCodeRow[] {
  const counts = new Map(accountCounts().map((a) => [a.collectiu, a.comptes]));
  const rows = getDb()
    .prepare(
      `SELECT j.codi AS codi, c.nom AS collectiu, j.actiu AS actiu
       FROM joincode j JOIN collectiu c ON c.id = j.collectiu_id ORDER BY c.id, j.codi`,
    )
    .all() as { codi: string; collectiu: string; actiu: number }[];
  const seen = new Set<string>();
  return rows.map((r) => {
    const first = !seen.has(r.collectiu);
    seen.add(r.collectiu);
    const total = counts.get(r.collectiu) ?? null; // null = under the minimum
    return { ...r, actiu: r.actiu === 1, comptes: first ? total : null, comptesSuppressed: total === null, showsCount: first };
  });
}

// ---------- dashboard window (date range + collective filter) ----------

export type WindowBucket = "day" | "week" | "month" | "all";
export interface DateWindow { from: string; to: string; bucket: WindowBucket } // ISO dates, inclusive

/** First and last day with a scored response, for presets ("today" never goes past the last data). */
export function getDataBounds(): { min: string | null; max: string | null } {
  const r = getDb()
    .prepare("SELECT MIN(substr(data,1,10)) AS lo, MAX(substr(data,1,10)) AS hi FROM v_resposta_analitica WHERE score IS NOT NULL")
    .get() as { lo: string | null; hi: string | null };
  return { min: r.lo, max: r.hi };
}

/** Synthetic population of one collective (or all). The denominator for participation. */
export function populationOf(collectiuId: number | null): number {
  const db = getDb();
  const r = (collectiuId === null
    ? db.prepare("SELECT COUNT(*) AS c FROM empleat_sintetic").get()
    : db.prepare("SELECT COUNT(*) AS c FROM empleat_sintetic WHERE collectiu_id = ?").get(collectiuId)) as { c: number };
  return r.c;
}

export interface Participation {
  /** Distinct people (lower bound), capped at the population; null when no readable period overlaps or the count is under the minimum group size. */
  respondents: number | null;
  population: number;
  /** Whole percent, 0..100, null when respondents is null. */
  pct: number | null;
}

/**
 * People (not answers) who took part in a date window, from the job-written `agregat` table. For each period the window overlaps
 * (up to the reading period), the segment's torn-less row is read: the all-domains row when present, else the largest per-domain n
 * (people who answered at least that domain). Periods under the minimum group size are ignored. The result is the maximum across
 * the overlapped periods (never a sum: the same person answers every month), capped at the population, so it is a lower bound of
 * distinct people and can never exceed the denominator. `collectiuId` null means the whole company.
 */
export function getParticipation(w: { from: string; to: string }, collectiuId: number | null): Participation {
  const db = getDb();
  const population = populationOf(collectiuId);
  const cap = readingPeriod(db);
  const lo = w.from.slice(0, 7);
  const hi = w.to.slice(0, 7);
  const periods = cap ? (db.prepare("SELECT DISTINCT periode FROM agregat WHERE periode >= ? AND periode <= ? AND periode <= ?").all(lo, hi, cap) as { periode: string }[]).map((r) => r.periode) : [];
  const rows = db.prepare("SELECT domini_id AS d, n FROM agregat WHERE periode = ? AND collectiu_id IS ? AND torn_id IS NULL");
  const scopeCount = (periode: string, c: number | null): number | null => {
    const r = rows.all(periode, c) as { d: number | null; n: number }[];
    if (!r.length) return null;
    const whole = r.find((x) => x.d === null);
    return whole ? whole.n : Math.max(...r.map((x) => x.n));
  };
  let best: number | null = null;
  for (const p of periods) {
    let n = scopeCount(p, collectiuId);
    if (n === null && collectiuId === null) {
      // No company-wide rows: add up the collectives, but only when all of them are readable.
      const parts = listCollectius().map((c) => scopeCount(p, c.id));
      n = parts.length && parts.every((x) => x !== null && x >= MIN_GROUP_SIZE) ? parts.reduce<number>((a, x) => a + (x as number), 0) : null;
    }
    if (n !== null && n >= MIN_GROUP_SIZE && (best === null || n > best)) best = n;
  }
  const respondents = best === null ? null : Math.min(best, population);
  const pct = respondents !== null && population > 0 ? Math.min(100, Math.round((respondents / population) * 100)) : null;
  return { respondents, population, pct };
}

const DAY_MS = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const isoOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export interface AnswersPerDay {
  /** Total answers in the (clamped) window; null under the minimum group size. */
  total: number | null;
  /** Average answers per calendar day of the clamped window; null under the minimum group size. */
  perDay: number | null;
}

/** Answers in a window and their daily average, from the analytics view only (no account ids). A total under the minimum group size is hidden. */
export function getAnswersPerDay(w: { from: string; to: string }, collectiuId: number | null): AnswersPerDay {
  const none = { total: null, perDay: null };
  const bounds = getDataBounds();
  if (!bounds.min || !bounds.max) return none;
  const lo = dayNum(w.from < bounds.min ? bounds.min : w.from);
  const hi = dayNum(w.to > bounds.max ? bounds.max : w.to);
  if (hi < lo) return none;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM v_resposta_analitica v
       WHERE substr(v.data,1,10) BETWEEN ? AND ? ${collectiuId === null ? "" : "AND v.collectiu_id = ?"}`,
    )
    .get(...(collectiuId === null ? [isoOf(lo), isoOf(hi)] : [isoOf(lo), isoOf(hi), collectiuId])) as { n: number };
  if (row.n < MIN_GROUP_SIZE) return none;
  return { total: row.n, perDay: row.n / (hi - lo + 1) };
}

const BUCKET_SQL: Record<WindowBucket, string> = {
  day: "substr(v.data,1,10)",
  week: "date(substr(v.data,1,10),'weekday 0','-6 days')",
  month: "substr(v.data,1,7)",
  all: "'Total'",
};
const bucketLabel = (b: WindowBucket, key: string) => (b === "day" || b === "week" ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : key);

/**
 * Same shape and rigour as getTrends (n < 10 hides, complementary suppression of collectives under "Tots"), but for an arbitrary
 * date window, read from the analytics view (no account ids). `n` is the largest per-question ANSWER count of the cell, not a count of
 * people (questions repeat, so it can exceed the population): use getParticipation for people. With `collectiuId` set, "Tots" is that collective alone. Means are on the 1-5 scale (1 + 4 x score).
 */
export function getWindowTrends(w: DateWindow, collectiuId: number | null = null): Trends {
  const db = getDb();
  const doms = db.prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
  const cols = listCollectius();
  const rows = db
    .prepare(
      `SELECT ${BUCKET_SQL[w.bucket]} AS b, v.collectiu_id AS c, v.domini_id AS d, v.pregunta_id AS q, COUNT(*) AS n, SUM(v.score) AS s
       FROM v_resposta_analitica v
       WHERE v.score IS NOT NULL AND substr(v.data,1,10) BETWEEN ? AND ? ${collectiuId === null ? "" : "AND v.collectiu_id = ?"}
       GROUP BY b, v.collectiu_id, v.domini_id, v.pregunta_id`,
    )
    .all(...(collectiuId === null ? [w.from, w.to] : [w.from, w.to, collectiuId])) as { b: string; c: number; d: number; q: number; n: number; s: number }[];
  const keys = [...new Set(rows.map((r) => r.b))].sort();

  type Acc = { n: number; s: number; q: Map<number, number> };
  const acc = new Map<string, Acc>();
  const add = (k: string, r: { q: number; n: number; s: number }) => {
    const a = acc.get(k) ?? { n: 0, s: 0, q: new Map<number, number>() };
    a.n += r.n; a.s += r.s; a.q.set(r.q, (a.q.get(r.q) ?? 0) + r.n);
    acc.set(k, a);
  };
  for (const r of rows) {
    add(`${r.b}|${r.c}|${r.d}`, r);
    add(`${r.b}|null|${r.d}`, r);
  }
  const cell = (b: string, c: number | null, d: number) => {
    const a = acc.get(`${b}|${c}|${d}`);
    return a ? { n: Math.max(...a.q.values()), mean: 1 + 4 * (a.s / a.n) } : null;
  };

  const reasonOf = new Map<string, HideReason>();
  for (const b of keys) {
    for (const d of doms) {
      const tot = cell(b, null, d.id);
      if (tot) reasonOf.set(`${b}|null|${d.id}`, tot.n < MIN_GROUP_SIZE ? "primari" : null);
      if (collectiuId !== null) continue;
      const present = cols.filter((c) => cell(b, c.id, d.id));
      const res = complementarySuppression(present.map((c) => ({ n: cell(b, c.id, d.id)!.n, primary: false })));
      present.forEach((c, k) => reasonOf.set(`${b}|${c.id}|${d.id}`, res[k]));
    }
  }

  const scopes: { id: number | null; nom: string }[] =
    collectiuId === null ? [{ id: null, nom: "Tots" }, ...cols.map((c) => ({ id: c.id, nom: c.nom }))] : [{ id: null, nom: cols.find((c) => c.id === collectiuId)?.nom ?? "Col·lectiu" }];
  const series = scopes
    .map((s) => ({
      scope: s.nom,
      rows: doms.map((d): TrendRow => {
        const cells = keys.map((b): TrendCell => {
          const r = cell(b, s.id, d.id);
          if (!r) return { mitjana: null, n: null, precisio: null, suprimit: false, motiu: null, consensus: null, confidence: null, sd: null };
          const motiu = reasonOf.get(`${b}|${s.id}|${d.id}`) ?? null;
          if (motiu) return { mitjana: null, n: null, precisio: null, suprimit: true, motiu, consensus: null, confidence: null, sd: null };
          return { mitjana: r.mean, n: r.n, precisio: precisionBand(r.n), suprimit: false, motiu: null, consensus: null, confidence: null, sd: null };
        });
        const last = cells.length - 1;
        return { domini: d.nom, cells, canvi: classifyChange(cells[last - 1], cells[last]) };
      }),
    }))
    .filter((s) => s.rows.some((r) => r.cells.some((c) => c.mitjana !== null || c.suprimit)));
  return { periodes: keys.map((k) => bucketLabel(w.bucket, k)), series };
}

// ---------- manager positivity bias (N-8, R-BIAS-5) ----------

export interface ManagerGapRow {
  domini: string;
  /** Means on the 1-5 scale; null when that side is under the minimum group size (suppressed). */
  managers: number | null;
  others: number | null;
  /** managers - others, in points; null when either side is suppressed. */
  gap: number | null;
}
export interface ManagerGap {
  /** Per domain, plus `total` over all domains. */
  rows: ManagerGapRow[];
  total: ManagerGapRow;
}

/**
 * Manager vs non-manager mean per domain, from the analytics view (it carries the role flag, never an account id). A side is
 * suppressed when its largest per-question ANSWER count in the cell is under the minimum group size (same convention as the trends);
 * the gap is shown only when both sides are visible. Managers are not removed from any other result: this is the documented bias.
 */
export function getManagerGap(): ManagerGap {
  const db = getDb();
  const doms = db.prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
  const rows = db
    .prepare(
      `SELECT v.domini_id AS d, v.es_manager AS m, v.pregunta_id AS q, COUNT(*) AS n, SUM(v.score) AS s
       FROM v_resposta_analitica v WHERE v.score IS NOT NULL GROUP BY v.domini_id, v.es_manager, v.pregunta_id`,
    )
    .all() as { d: number; m: number; q: number; n: number; s: number }[];
  type Acc = { n: number; s: number; maxQ: number };
  const side = (pick: (r: { d: number; m: number }) => boolean, m: number): number | null => {
    const a: Acc = { n: 0, s: 0, maxQ: 0 };
    for (const r of rows) if (r.m === m && pick(r)) { a.n += r.n; a.s += r.s; a.maxQ = Math.max(a.maxQ, r.n); }
    return a.maxQ >= MIN_GROUP_SIZE && a.n > 0 ? 1 + 4 * (a.s / a.n) : null;
  };
  const build = (domini: string, pick: (r: { d: number; m: number }) => boolean): ManagerGapRow => {
    const managers = side(pick, 1);
    const others = side(pick, 0);
    return { domini, managers, others, gap: managers !== null && others !== null ? managers - others : null };
  };
  return { rows: doms.map((d) => build(d.nom, (r) => r.d === d.id)), total: build("", () => true) };
}
