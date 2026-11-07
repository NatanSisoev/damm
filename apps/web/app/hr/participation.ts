// Low-participation rule for published needs (R-FLOW-5d, 5e). Aggregates only: never who has or has not answered.
import { MIN_GROUP_SIZE } from "@damm/shared";

/** A published need is "low" when fewer than this share of its collective's population has answered. */
export const LOW_PARTICIPATION_PCT = 30;

export type Participation = { low: false } | { low: true; pct: number | null };

/**
 * `responses` is null when the count is under the minimum group size (see NeedCard), so the share cannot be shown:
 * that case counts as low too, without revealing the number. `population` is the synthetic headcount of the target.
 */
export function participationOf(n: { responses: number | null; population: number }): Participation {
  if (n.responses == null || n.responses < MIN_GROUP_SIZE) return { low: true, pct: null };
  if (n.population <= 0) return { low: false };
  const pct = Math.min(100, Math.round((n.responses / n.population) * 100));
  return pct < LOW_PARTICIPATION_PCT ? { low: true, pct } : { low: false };
}
