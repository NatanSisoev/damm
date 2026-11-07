// Helpers to snapshot, clone and scan databases in tests.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { all } from "../src/db.ts";
import type { SqlDatabase } from "../src/db.ts";
import type { TestDb } from "./world-gen.ts";

export const OUTPUT_TABLES = ["agregat", "domain_importance", "insight", "senyal"] as const;
export const STATE_TABLES = ["person_domain_state", "item_stats", "format_stats", "assignment", "resposta"] as const;

/** Rows of a table as a JSON string, ordered by every column so the result does not depend on rowid order. */
export function dumpTable(db: SqlDatabase, table: string, opts: { dropIds?: boolean } = {}): string {
  const cols = all<{ name: string }>(db, `SELECT name FROM pragma_table_info('${table}')`).map((c) => c.name);
  const keep = opts.dropIds ? cols.filter((c) => c !== "id") : cols;
  const rows = all<Record<string, unknown>>(db, `SELECT ${keep.map((c) => `"${c}"`).join(",")} FROM ${table} ORDER BY ${keep.map((c) => `"${c}"`).join(",")}`);
  return JSON.stringify(rows);
}

export function dumpAll(db: SqlDatabase, tables: readonly string[] = [...OUTPUT_TABLES, ...STATE_TABLES, "engine_config"]): Record<string, string> {
  return Object.fromEntries(tables.map((t) => [t, dumpTable(db, t)]));
}

/** Independent in-memory copy of a database (VACUUM INTO a temp file, load it back). */
export function cloneDb(db: SqlDatabase): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "engine-clone-"));
  const file = join(dir, "copy.db");
  try {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const src = new DatabaseSync(file);
    const copy = new DatabaseSync(":memory:");
    const tables = src.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table' DESC").all() as { name: string; sql: string }[];
    for (const t of tables) copy.exec(t.sql);
    copy.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS src`);
    for (const t of tables) if (/^CREATE TABLE/i.test(t.sql)) copy.exec(`INSERT INTO main."${t.name}" SELECT * FROM src."${t.name}"`);
    copy.exec("DETACH DATABASE src");
    src.close();
    return copy as unknown as TestDb;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every numeric cell in every user table that is NaN or infinite, plus text cells reading "NaN". */
export function findBadNumbers(db: SqlDatabase): string[] {
  const bad: string[] = [];
  const tables = all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const { name } of tables) {
    const cols = all<{ name: string; type: string }>(db, `SELECT name, type FROM pragma_table_info('${name}')`);
    for (const c of cols) {
      const n = all<{ n: number }>(
        db,
        `SELECT COUNT(*) AS n FROM "${name}" WHERE ("${c.name}" IS NOT NULL AND typeof("${c.name}") = 'real' AND ("${c.name}" != "${c.name}" OR abs("${c.name}") > 1e300))
           OR (typeof("${c.name}") = 'text' AND "${c.name}" IN ('NaN','Infinity','-Infinity'))`,
      )[0]!.n;
      if (n > 0) bad.push(`${name}.${c.name}: ${n}`);
    }
  }
  return bad;
}
