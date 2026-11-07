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
  }
  return cached;
}
