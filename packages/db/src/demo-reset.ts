// Demo reset (N-17): put the demo database back to its post-`demo-db` state, on the app's live connection.
// A pristine snapshot sits next to the DB ("<DB_PATH>.pristine"). Reset ATTACHes it and copies every table back
// inside one transaction, so no file is swapped and the engine's open connection stays valid.
// Accounts and push subscriptions are kept, so a phone enrolled for the demo survives a reset; their answers do not.
import fs from "node:fs";
import { dbPath, getDb } from "./connection";

/** Tables a reset leaves alone: people who joined the demo and their devices. */
const KEEP = new Set(["compte", "push_subscripcio", "hr_push_subscription"]);

export const demoResetEnabled = (): boolean => process.env.DEMO_RESET_ENABLED === "1";
export const snapshotPath = (): string => `${dbPath()}.pristine`;
export const hasSnapshot = (): boolean => fs.existsSync(snapshotPath());

/** Writes the snapshot from the current database if there is none yet. Call it on a clean demo DB. Returns true when it wrote one. */
export function ensureSnapshot(): boolean {
  if (hasSnapshot()) return false;
  const tmp = `${snapshotPath()}.tmp`;
  fs.rmSync(tmp, { force: true });
  getDb().prepare("VACUUM INTO ?").run(tmp);
  fs.renameSync(tmp, snapshotPath());
  return true;
}

const tablesOf = (db: ReturnType<typeof getDb>, schema: "main" | "snap"): string[] =>
  (db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[]).map((r) => r.name);

const columnsOf = (db: ReturnType<typeof getDb>, schema: "main" | "snap", table: string): string[] =>
  (db.prepare(`PRAGMA ${schema}.table_info("${table}")`).all() as { name: string }[]).map((r) => r.name);

/** Restores every table except the kept ones from the snapshot. Throws "no-snapshot" or "disabled"; rolls back on any error. */
export function resetDemo(): { tables: number } {
  if (!demoResetEnabled()) throw new Error("disabled");
  if (!hasSnapshot()) throw new Error("no-snapshot");
  const db = getDb();
  db.pragma("foreign_keys = OFF"); // no-op inside a transaction, so set it first; checked explicitly below
  db.prepare("ATTACH DATABASE ? AS snap").run(snapshotPath());
  try {
    const snapTables = new Set(tablesOf(db, "snap"));
    const tables = tablesOf(db, "main").filter((t) => !KEEP.has(t) && snapTables.has(t));
    db.transaction(() => {
      for (const t of tables) {
        const snapCols = new Set(columnsOf(db, "snap", t));
        const cols = columnsOf(db, "main", t).filter((c) => snapCols.has(c)).map((c) => `"${c}"`).join(", ");
        db.exec(`DELETE FROM main."${t}"`);
        db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM snap."${t}"`);
      }
      const broken = db.prepare("PRAGMA foreign_key_check").all();
      if (broken.length) throw new Error(`foreign-key-check: ${broken.length} broken rows`);
    })();
    return { tables: tables.length };
  } finally {
    db.exec("DETACH DATABASE snap");
    db.pragma("foreign_keys = ON");
  }
}
