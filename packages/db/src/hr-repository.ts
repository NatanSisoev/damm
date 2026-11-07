// HR-side data access. The only repository HR routes may import.
// Reads aggregate outputs and the analytics view; never `resposta` or `compte`.
import crypto from "node:crypto";
import type { Agregat, Recomanacio, Senyal } from "@damm/shared";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";

export interface DraftQuestion {
  id: number;
  domini: string;
  tipus: string;
  text: string;
  necessitatId: number | null;
  generadaPerIa: boolean;
}

export function createNecessitat(input: {
  textNl: string;
  collectiuId: number | null;
  duradaMaxS: number | null;
}): number {
  const r = getDb()
    .prepare("INSERT INTO necessitat (text_nl, collectiu_id, durada_max_s) VALUES (?, ?, ?)")
    .run(input.textNl, input.collectiuId, input.duradaMaxS);
  return Number(r.lastInsertRowid);
}

export function listCollectius(): { id: number; nom: string }[] {
  return getDb().prepare("SELECT id, nom FROM collectiu ORDER BY id").all() as { id: number; nom: string }[];
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

export function updateDraftText(id: number, text: string): void {
  getDb().prepare("UPDATE pregunta SET text = ? WHERE id = ? AND estat = 'draft'").run(text, id);
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
       WHERE n.estat <> 'publicada' GROUP BY n.id`,
    )
    .all() as { id: number; textNl: string; approved: number }[];
}

/** Publish = approved questions are already in the pool; create the join code and link. */
export function publishNecessitat(necessitatId: number, baseUrl: string) {
  const db = getDb();
  const n = db.prepare("SELECT collectiu_id AS c FROM necessitat WHERE id = ?").get(necessitatId) as { c: number | null } | undefined;
  if (!n) throw new Error("Necessitat not found");
  const codi = crypto.randomBytes(4).toString("hex").toUpperCase();
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO joincode (codi, empresa, collectiu_id) VALUES (?, 'Demo', ?)").run(codi, n.c ?? 1);
    db.prepare("INSERT INTO publicacio (necessitat_id, codi_join, qr_url) VALUES (?, ?, ?)").run(
      necessitatId, codi, `${baseUrl}/join/${codi}`,
    );
    db.prepare("UPDATE necessitat SET estat = 'publicada' WHERE id = ?").run(necessitatId);
  });
  tx();
  return { codi, url: `${baseUrl}/join/${codi}` };
}

export function listPublications() {
  return getDb()
    .prepare(
      `SELECT pu.id, pu.codi_join AS codi, pu.qr_url AS url, n.text_nl AS textNl
       FROM publicacio pu JOIN necessitat n ON n.id = pu.necessitat_id ORDER BY pu.id DESC`,
    )
    .all() as { id: number; codi: string; url: string; textNl: string }[];
}

export interface AggregateRow extends Omit<Agregat, "collectiuId" | "tornId" | "dominiId"> {
  collectiu: string | null;
  torn: string | null;
  domini: string | null;
}

/** Suppression is re-enforced on read, whatever the job wrote. */
export function listAggregates(): AggregateRow[] {
  return (getDb()
    .prepare(
      `SELECT a.periode, c.nom AS collectiu, t.nom AS torn, d.nom AS domini, a.n, a.mitjana, a.suprimit
       FROM agregat a LEFT JOIN collectiu c ON c.id = a.collectiu_id
       LEFT JOIN torn t ON t.id = a.torn_id LEFT JOIN domini d ON d.id = a.domini_id
       ORDER BY a.periode DESC, c.nom, t.nom, d.nom`,
    )
    .all() as any[]).map((r) => {
    const hidden = r.n < MIN_GROUP_SIZE || !!r.suprimit;
    return { ...r, suprimit: hidden, mitjana: hidden ? null : r.mitjana };
  });
}

export function listSignals(): (Omit<Senyal, "collectiuId"> & { collectiu: string | null })[] {
  return (getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, c.nom AS collectiu, s.periode, s.n, s.confianca, s.suprimit
       FROM senyal s LEFT JOIN collectiu c ON c.id = s.collectiu_id ORDER BY s.n DESC`,
    )
    .all() as any[])
    .filter((r) => r.n >= MIN_GROUP_SIZE && !r.suprimit)
    .map((r) => ({ ...r, suprimit: false }));
}

export function listRecommendations(): Recomanacio[] {
  return getDb()
    .prepare(
      `SELECT id, senyal_id AS senyalId, text, estat, seguiment_necessitat_id AS seguimentNecessitatId
       FROM recomanacio ORDER BY id`,
    )
    .all() as Recomanacio[];
}

export function approveRecommendation(id: number): void {
  getDb().prepare("UPDATE recomanacio SET estat = 'aprovada' WHERE id = ? AND estat = 'proposada'").run(id);
}

export function discardRecommendation(id: number): void {
  getDb().prepare("UPDATE recomanacio SET estat = 'descartada' WHERE id = ? AND estat = 'proposada'").run(id);
}

/** Follow-up survey: a new open need linked to an approved recommendation. Questions come from the AI layer. */
export function createFollowUp(recId: number): number | null {
  const db = getDb();
  const r = db.prepare("SELECT text, estat, seguiment_necessitat_id AS s FROM recomanacio WHERE id = ?").get(recId) as
    | { text: string; estat: string; s: number | null } | undefined;
  if (!r || r.estat !== "aprovada" || r.s) return r?.s ?? null;
  const id = createNecessitat({ textNl: `Seguiment: ${r.text}`, collectiuId: null, duradaMaxS: 60 });
  db.prepare("UPDATE recomanacio SET seguiment_necessitat_id = ? WHERE id = ?").run(id, recId);
  return id;
}

/** Admin view: account counts per collective only. */
export function accountCounts(): { collectiu: string; comptes: number }[] {
  return getDb()
    .prepare(
      `SELECT c.nom AS collectiu, COUNT(k.id) AS comptes FROM collectiu c
       LEFT JOIN compte k ON k.collectiu_id = c.id GROUP BY c.id ORDER BY c.id`,
    )
    .all() as { collectiu: string; comptes: number }[];
}
