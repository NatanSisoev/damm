// Fills `pregunta.text_i18n` and option `i18n` for rows that have no translations yet, by matching
// the stored text (Catalan seed text or the English engine bank text) against a translations file
// (docs/i18n/question-bank-translations.json). Idempotent: rows that already have text_i18n are
// left alone, so HR edits are never overwritten. Does not touch the engine.
import { getDb, type Db } from "./connection";

/** Additive i18n columns for databases built before they existed (schema.sql has them for new ones). Employee-side: run at server start, before the backfill. */
export function ensureI18nColumns(db: Db): void {
  const has = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has("pregunta", "text_i18n")) db.exec("ALTER TABLE pregunta ADD COLUMN text_i18n TEXT");
  if (!has("compte", "lang"))
    db.exec("ALTER TABLE compte ADD COLUMN lang TEXT NOT NULL DEFAULT 'ca' CHECK (lang IN ('ca','es','en'))");
}


export interface BankTranslationEntry {
  type?: string;
  text: { ca: string; es: string; en: string };
  options?: { ca: string; es: string; en: string }[];
}
export interface BankTranslations { questions: BankTranslationEntry[] }

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function applyBankTranslations(bank: BankTranslations): { updated: number; scanned: number } {
  const db = getDb();
  ensureI18nColumns(db);
  const byText = new Map<string, BankTranslationEntry>();
  for (const q of bank.questions) {
    for (const t of [q.text.ca, q.text.en]) if (t) byText.set(norm(t), q);
  }
  const rows = db
    .prepare("SELECT id, text, options_json FROM pregunta WHERE text_i18n IS NULL")
    .all() as { id: number; text: string; options_json: string | null }[];
  const upd = db.prepare("UPDATE pregunta SET text_i18n = ?, options_json = ? WHERE id = ?");
  let updated = 0;
  db.transaction(() => {
    for (const r of rows) {
      const e = byText.get(norm(r.text));
      if (!e) continue;
      let optionsJson = r.options_json;
      if (optionsJson && e.options) {
        try {
          const arr = JSON.parse(optionsJson);
          if (Array.isArray(arr) && arr.length === e.options.length) {
            optionsJson = JSON.stringify(arr.map((o, k) => ({ ...o, i18n: e.options![k] })));
          }
        } catch {
          /* leave malformed options untouched */
        }
      }
      upd.run(JSON.stringify(e.text), optionsJson, r.id);
      updated++;
    }
  })();
  return { updated, scanned: rows.length };
}
