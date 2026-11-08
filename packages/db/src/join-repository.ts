// Read-only lookup of a join code for the public landing page.
// Exposes only company, collective and active flag; never accounts or responses.
import { getDb } from "./connection";

export interface JoinCodeInfo {
  /** Canonical code as stored (use it for links and registration). */
  codi: string;
  empresa: string;
  collectiu: string;
  actiu: boolean;
}

/** Matching key: no diacritics, hyphens, spaces or case ("DEMO-FÀB" = "demo fab" = "DEMOFAB"). */
export function joinCodeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_-]+/g, "")
    .toUpperCase();
}

export function lookupJoinCode(input: string): JoinCodeInfo | null {
  const key = joinCodeKey(input);
  if (!key) return null;
  const rows = getDb()
    .prepare(
      `SELECT j.codi, j.empresa, c.nom AS collectiu, j.actiu
       FROM joincode j JOIN collectiu c ON c.id = j.collectiu_id`,
    )
    .all() as { codi: string; empresa: string; collectiu: string; actiu: number }[];
  const matches = rows.filter((r) => joinCodeKey(r.codi) === key);
  // Prefer an exact (case-insensitive) match if the loose key is ambiguous.
  const row = matches.length > 1 ? (matches.find((r) => r.codi.toUpperCase() === input.trim().toUpperCase()) ?? null) : (matches[0] ?? null);
  return row ? { codi: row.codi, empresa: row.empresa, collectiu: row.collectiu, actiu: row.actiu === 1 } : null;
}

export interface ShiftOption {
  id: number;
  /** Stable name ("mati", "tarda", "nit"); localise it with the shift label helper. */
  nom: string;
}

/**
 * Shifts that exist for a collective, derived from its population (collectives without shifts return []).
 * Reads the synthetic population only for the shift list; never accounts or responses.
 */
export function listShiftsForCollective(collectiuId: number): ShiftOption[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT t.id, t.nom FROM empleat_sintetic e JOIN torn t ON t.id = e.torn_id
       WHERE e.collectiu_id = ? ORDER BY t.id`,
    )
    .all(collectiuId) as unknown as ShiftOption[];
}

/** Shifts for the collective behind a join code (for the optional onboarding step). */
export function listShiftsForJoinCode(codi: string): ShiftOption[] {
  const row = getDb()
    .prepare("SELECT j.collectiu_id AS id FROM joincode j WHERE j.codi = ?")
    .get(codi) as { id: number } | undefined;
  return row ? listShiftsForCollective(row.id) : [];
}
