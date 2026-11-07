// Read-only lookup of a join code for the public landing page.
// Exposes only company, collective and active flag; never accounts or responses.
import { getDb } from "./connection";

export interface JoinCodeInfo {
  empresa: string;
  collectiu: string;
  actiu: boolean;
}

export function lookupJoinCode(codi: string): JoinCodeInfo | null {
  const row = getDb()
    .prepare(
      `SELECT j.empresa, c.nom AS collectiu, j.actiu
       FROM joincode j JOIN collectiu c ON c.id = j.collectiu_id
       WHERE j.codi = ?`,
    )
    .get(codi) as { empresa: string; collectiu: string; actiu: number } | undefined;
  return row ? { empresa: row.empresa, collectiu: row.collectiu, actiu: row.actiu === 1 } : null;
}
