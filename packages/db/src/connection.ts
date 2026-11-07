import Database from "better-sqlite3";
import path from "node:path";

export type Db = Database.Database;

export function dbPath(): string {
  return process.env.DB_PATH ?? path.resolve(process.cwd(), "../../data/app.db");
}

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    cached = new Database(dbPath());
    cached.pragma("foreign_keys = ON");
    cached.pragma("journal_mode = WAL");
    ensureApprovalColumn(cached);
  }
  return cached;
}

/** Additive column for databases built before it existed (schema.sql has it for new ones). Idempotent. */
function ensureApprovalColumn(db: Db): void {
  const cols = db.prepare("PRAGMA table_info(recomanacio)").all() as { name: string }[];
  if (cols.length && !cols.some((c) => c.name === "aprovada_per")) db.exec("ALTER TABLE recomanacio ADD COLUMN aprovada_per TEXT");
}
