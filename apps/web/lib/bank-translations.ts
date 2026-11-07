// Fill missing question translations (engine bank rows are English-only) from the shipped file.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyBankTranslations } from "@damm/db/employee";

export function loadBankTranslations(): void {
  const rel = join("docs", "i18n", "question-bank-translations.json");
  const file = [resolve(process.cwd(), rel), resolve(process.cwd(), "..", "..", rel)].find(existsSync);
  if (file) applyBankTranslations(JSON.parse(readFileSync(file, "utf8")));
}
