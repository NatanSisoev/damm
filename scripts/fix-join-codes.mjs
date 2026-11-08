// Idempotent startup step: rename the accented demo join code to its ASCII form.
// Only runs the UPDATE when the old code exists and the new one does not.
import { DatabaseSync } from "node:sqlite";

const OLD = "DEMO-FÀB".normalize("NFC");
const NEW = "DEMO-FAB";
const db = new DatabaseSync(process.env.DB_PATH ?? "/data/app.db");
try {
  const has = (c) => db.prepare("SELECT 1 FROM joincode WHERE codi = ?").get(c) !== undefined;
  if (has(OLD) && !has(NEW)) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    db.prepare("UPDATE joincode SET codi = ? WHERE codi = ?").run(NEW, OLD);
    db.prepare("UPDATE publicacio SET codi_join = ? WHERE codi_join = ?").run(NEW, OLD); // keeps published links pointing at the code
    db.exec("COMMIT");
    console.log(`[start] renamed join code ${OLD} -> ${NEW}`);
  }
} catch (e) {
  console.log(`[start] join code rename skipped: ${e.message}`);
} finally {
  db.close();
}
