// Loads the sample question bank (question-bank.json) into `pregunta`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTIUS } from "@damm/shared";
import { all, one, run, transaction, type SqlDatabase } from "../src/db.ts";

export interface BankQuestion {
  domainId: number;
  facet: string;
  type: string;
  text: string;
  polarity: number;
  /** pair/choice: [{label, score}]; ranking: [{label, domain_id}] */
  options?: Array<{ label: string; score?: number; domain_id?: number }>;
  /** 1..4 in COLLECTIUS order (Fàbriques, Logística, Comercial, Oficines); absent = everyone */
  collectiuId?: number;
  isFollowup?: boolean;
}

export function readQuestionBank(): BankQuestion[] {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "question-bank.json"), "utf8")) as BankQuestion[];
}

/**
 * Inserts the bank into `pregunta` (default estat 'aprovada'). Returns the number of rows inserted.
 * Collective ids in the bank follow COLLECTIUS order; they are mapped to the ids the DB uses by name,
 * so the DB must already contain the collectives the bank refers to.
 */
export function loadQuestionBank(db: SqlDatabase, opts: { estat?: string } = {}): number {
  const estat = opts.estat ?? "aprovada";
  const bank = readQuestionBank();
  const dbIds = new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM collectiu").map((c) => [c.nom, c.id]));
  const collectiu = (bankId: number | undefined): number | null => {
    if (bankId === undefined) return null;
    const name = COLLECTIUS[bankId - 1];
    const id = name === undefined ? undefined : dbIds.get(name);
    if (id === undefined) throw new Error(`question bank refers to collective ${bankId} (${name}) which is not in the database`);
    return id;
  };
  return transaction(db, () => {
    for (const q of bank) {
      run(
        db,
        `INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, estat)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        q.domainId,
        collectiu(q.collectiuId),
        q.text,
        q.type,
        q.facet,
        q.polarity,
        q.options ? JSON.stringify(q.options) : null,
        q.isFollowup ? 1 : 0,
        estat,
      );
    }
    return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM pregunta WHERE estat = ?", estat)?.n ?? 0;
  });
}
