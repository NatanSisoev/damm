// Read-side translation overlay for generated HR text (themes, recommendations, needs, signals).
// Catalan is canonical in the source column; `traduccio` holds es/en (and optional ca) overrides.
// A missing table (databases built before it existed) or a missing row falls back to the source text.
import type { Lang } from "@damm/shared";
import type { Db } from "./connection";

export type TranslatableEntity = "tema" | "recomanacio" | "necessitat" | "senyal";

/** Replaces the listed fields of each row with their translation for `lang`. Mutates and returns the rows. */
export function overlayTranslations<T extends { id: number }>(
  db: Db,
  entity: TranslatableEntity,
  rows: T[],
  fields: Record<string, keyof T>,
  lang: Lang | undefined,
): T[] {
  if (!lang || lang === "ca" || rows.length === 0) return rows;
  let found: { entitat_id: number; camp: string; text: string }[];
  try {
    found = db
      .prepare("SELECT entitat_id, camp, text FROM traduccio WHERE entitat = ? AND lang = ?")
      .all(entity, lang) as typeof found;
  } catch {
    return rows; // table not there yet
  }
  if (found.length === 0) return rows;
  const byKey = new Map(found.map((f) => [`${f.entitat_id}:${f.camp}`, f.text]));
  for (const r of rows) {
    for (const [col, prop] of Object.entries(fields)) {
      const t = byKey.get(`${r.id}:${col}`);
      if (t !== undefined && (r[prop] as unknown) != null) (r as Record<keyof T, unknown>)[prop] = t;
    }
  }
  return rows;
}

export const RECOMMENDATION_FIELDS = {
  text: "text",
  titol: "titol",
  iniciativa: "iniciativa",
  responsable_suggerit: "responsableSuggerit",
  termini_suggerit: "terminiSuggerit",
  justificacio: "justificacio",
  limits: "limits",
} as const;
