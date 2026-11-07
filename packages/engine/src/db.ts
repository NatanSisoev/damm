// Minimal SQLite surface the engine needs. Satisfied by better-sqlite3 (the app) and node:sqlite (tests),
// so the engine has no database dependency of its own: the caller injects the connection.

export type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
}

const depth = new WeakMap<SqlDatabase, number>();

/** Runs fn in a transaction. Nested calls join the outer transaction. */
export function transaction<T>(db: SqlDatabase, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  if (d > 0) {
    depth.set(db, d + 1);
    try {
      return fn();
    } finally {
      depth.set(db, d);
    }
  }
  db.exec("BEGIN");
  depth.set(db, 1);
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    depth.set(db, 0);
  }
}

export const all = <T>(db: SqlDatabase, sql: string, ...p: SqlValue[]): T[] => db.prepare(sql).all(...p) as T[];
export const one = <T>(db: SqlDatabase, sql: string, ...p: SqlValue[]): T | undefined =>
  db.prepare(sql).get(...p) as T | undefined;
export const run = (db: SqlDatabase, sql: string, ...p: SqlValue[]) => db.prepare(sql).run(...p);
