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
    ensureDismissedStatus(cached);
    cached.pragma("foreign_keys = ON");
    cached.pragma("journal_mode = WAL");
    ensureApprovalColumn(cached);
  }
  return cached;
}

/**
 * Databases built before 'dismissed' existed have a status CHECK without it. SQLite cannot alter a CHECK,
 * so the table is rebuilt with the same columns, rows and indexes. Runs before foreign keys are switched on
 * (recomanacio references senyal). Idempotent: skipped once the stored CREATE statement allows 'dismissed'.
 */
function ensureDismissedStatus(db: Db): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'senyal'").get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'dismissed'")) return;
  const createSql = row.sql
    .replace(/'resolved'\s*\)/, "'resolved','dismissed')")
    .replace(/^CREATE TABLE\s+"?senyal"?/, "CREATE TABLE senyal_new");
  if (!createSql.includes("'dismissed'")) return;
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'senyal' AND sql IS NOT NULL").all() as { sql: string }[];
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(createSql);
    db.exec("INSERT INTO senyal_new SELECT * FROM senyal");
    db.exec("DROP TABLE senyal");
    db.exec("ALTER TABLE senyal_new RENAME TO senyal");
    for (const i of indexes) db.exec(i.sql);
  })();
}

/** Additive column for databases built before it existed (schema.sql has it for new ones). Idempotent. */
function ensureApprovalColumn(db: Db): void {
  const cols = db.prepare("PRAGMA table_info(recomanacio)").all() as { name: string }[];
  if (cols.length && !cols.some((c) => c.name === "aprovada_per")) db.exec("ALTER TABLE recomanacio ADD COLUMN aprovada_per TEXT");
}
