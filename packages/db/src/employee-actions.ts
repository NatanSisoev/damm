// Employee-side "Has dit, hem fet": approved actions for the caller's own collective.
// Aggregate context only: the action text, the period and the number of respondents behind the
// signal. No account data, no answers, no comments. Anything under the minimum group size, or
// flagged as suppressed, is never returned.
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";

export type ApprovedAction = {
  id: number;
  text: string;
  periode: string; // 'YYYY-MM'
  n: number; // respondents behind the signal (always >= MIN_GROUP_SIZE)
  seguimentEnMarxa: boolean; // a follow-up survey was published for it
};

export function approvedActionsForCompte(compteId: string): ApprovedAction[] {
  const db = getDb();
  const c = db.prepare("SELECT collectiu_id FROM compte WHERE id = ?").get(compteId) as
    | { collectiu_id: number }
    | undefined;
  if (!c) return [];
  const rows = db
    .prepare(
      `SELECT r.id, r.text, s.periode, s.n, (nec.estat = 'publicada') AS seguiment
       FROM recomanacio r
       JOIN senyal s ON s.id = r.senyal_id
       LEFT JOIN necessitat nec ON nec.id = r.seguiment_necessitat_id
       WHERE r.estat = 'aprovada'
         AND s.suprimit = 0
         AND s.n >= @min
         AND (s.collectiu_id IS NULL OR s.collectiu_id = @collectiu)
       ORDER BY s.periode DESC, r.id DESC
       LIMIT 20`,
    )
    .all({ min: MIN_GROUP_SIZE, collectiu: c.collectiu_id }) as {
    id: number;
    text: string;
    periode: string;
    n: number;
    seguiment: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    periode: r.periode,
    n: r.n,
    seguimentEnMarxa: r.seguiment === 1,
  }));
}
