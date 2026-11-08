// Employee-side DB handle: same connection as getDb(), plus the additive i18n columns (compte.lang, pregunta.text_i18n)
// for databases built before they existed. Runs once per connection, so an old DB never breaks login or answering,
// whether or not the bank-translations backfill ran. Kept out of connection.ts, which the HR side also uses.
import { getDb as baseGetDb, type Db } from "./connection";
import { ensureI18nColumns } from "./i18n-backfill";

let prepared: Db | undefined;

export function getDb(): Db {
  const db = baseGetDb();
  if (prepared !== db) {
    ensureI18nColumns(db);
    prepared = db;
  }
  return db;
}
