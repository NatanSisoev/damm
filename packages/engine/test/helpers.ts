import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SqlDatabase } from "../src/db.ts";

const SCHEMA = readFileSync(resolve(import.meta.dirname, "../../db/schema.sql"), "utf8");

export const DAY_MS = 86_400_000;
export const T0 = Date.UTC(2026, 9, 1, 9, 0, 0); // 2026-10-01 09:00 UTC

/** In-memory DB with the shared schema, 6 domains, 2 collectives and a small synthetic population. */
export function makeDb(opts: { accountsPerCollective?: number } = {}): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  ["Benestar", "Lideratge", "Desenvolupament", "Cultura i pertinença", "Entorn i relacions", "Condicions i organització"].forEach((n, i) =>
    db.prepare("INSERT INTO domini (id, nom) VALUES (?, ?)").run(i + 1, n),
  );
  db.prepare("INSERT INTO collectiu (id, nom) VALUES (1, 'Fàbriques'), (2, 'Oficines')").run();
  db.prepare("INSERT INTO torn (id, nom) VALUES (1, 'mati'), (2, 'nit')").run();
  db.prepare("INSERT INTO centre_tipus (id, nom) VALUES (1, 'fabrica')").run();
  const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (?, 1, ?)");
  for (let i = 0; i < 40; i++) emp.run(1, i % 2 === 0 ? 1 : 2);
  for (let i = 0; i < 30; i++) emp.run(2, null);
  const acc = db.prepare("INSERT INTO compte (id, collectiu_id, torn_id, username, password_hash, salt) VALUES (?, ?, ?, ?, 'x', 'x')");
  const n = opts.accountsPerCollective ?? 12;
  for (let i = 0; i < n; i++) acc.run(`f${i}`, 1, i % 2 === 0 ? 1 : 2, `uf${i}`);
  for (let i = 0; i < n; i++) acc.run(`o${i}`, 2, null, `uo${i}`);
  return db as unknown as SqlDatabase & { close(): void };
}

let qid = 0;
/** Adds an approved question; returns its id. */
export function addQuestion(
  db: SqlDatabase,
  q: { domain: number; type: string; facet?: string; polarity?: number; options?: unknown; needId?: number; followup?: boolean; collectiu?: number; priority?: number },
): number {
  qid++;
  const r = db
    .prepare(
      `INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, necessitat_id, estat, prioritat)
       VALUES (?,?,?,?,?,?,?,?,?, 'aprovada', ?)`,
    )
    .run(
      q.domain,
      q.collectiu ?? null,
      `Question ${qid}`,
      q.type,
      q.facet ?? null,
      q.polarity ?? 1,
      q.options ? JSON.stringify(q.options) : null,
      q.followup ? 1 : 0,
      q.needId ?? null,
      q.priority ?? 0,
    );
  return Number(r.lastInsertRowid);
}

/** Two scale10 items and one yes_no item per domain. */
export function addPool(db: SqlDatabase): void {
  for (let d = 1; d <= 6; d++) {
    addQuestion(db, { domain: d, type: "scale10", facet: `f${d}a` });
    addQuestion(db, { domain: d, type: "scale10", facet: `f${d}b` });
    addQuestion(db, { domain: d, type: "yes_no", facet: `f${d}a` });
  }
}

export const identity = (s: string) => s;
