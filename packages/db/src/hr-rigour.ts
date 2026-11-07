// Statistical rigour on the read side: complementary suppression, precision bands and the change rule.
// Pure functions, no DB access. Re-exported from `hr.ts`.
import { MIN_GROUP_SIZE } from "@damm/shared";

// Local constants. They move to `@damm/shared` once agreed with Natan.
export const PRECISION_MODERADA_MIN_N = 30; // below: "indicativa"
export const PRECISION_SOLIDA_MIN_N = 100; // from here: "sòlida"
export const CHANGE_MIN_DELTA = 0.3; // on the 1-5 scale
export const CHANGE_MIN_N = 30; // both periods
export const REP_GAP_FLAG = 0.05; // representativeness gap (share points) from which a segment is flagged

export type PrecisionBand = "indicativa" | "moderada" | "sòlida";
export type ChangeLabel = "puja" | "baixa" | "sense canvi clar";

export function precisionBand(n: number): PrecisionBand {
  if (n >= PRECISION_SOLIDA_MIN_N) return "sòlida";
  if (n >= PRECISION_MODERADA_MIN_N) return "moderada";
  return "indicativa";
}

export interface ChangePoint {
  mitjana: number | null;
  n: number | null;
}

export interface Change {
  label: ChangeLabel;
  delta: number | null; // current - previous; null when either point is missing or hidden
}

/** Period-over-period change. "puja"/"baixa" only if |Δ| >= 0.3 and both periods have n >= 30. */
export function classifyChange(prev: ChangePoint | null | undefined, cur: ChangePoint | null | undefined): Change {
  if (!prev || !cur || prev.mitjana === null || cur.mitjana === null || prev.n === null || cur.n === null) {
    return { label: "sense canvi clar", delta: null };
  }
  const delta = Math.round((cur.mitjana - prev.mitjana) * 1000) / 1000; // avoid 0.2999… at the boundary
  if (prev.n < CHANGE_MIN_N || cur.n < CHANGE_MIN_N || Math.abs(delta) < CHANGE_MIN_DELTA) {
    return { label: "sense canvi clar", delta };
  }
  return { label: delta > 0 ? "puja" : "baixa", delta };
}

export interface SiblingCell {
  /** True n of the cell, or null when the cell has no published count (then it is ignored by the rule). */
  n: number | null;
  /** Already hidden for its own size (primary suppression), whatever its n. */
  primary: boolean;
}

export type HideReason = "primari" | "complementari" | null;

/**
 * Complementary suppression for the children of one parent (shifts under a collective, collectives under "Tots").
 * Primary: n < MIN_GROUP_SIZE or flagged. If exactly one child is hidden, or the hidden children's n sum to under
 * MIN_GROUP_SIZE, the smallest visible sibling is hidden too, so no hidden n can be recovered as parent - visible.
 * The same cells must lose both mean and n.
 */
export function complementarySuppression(children: SiblingCell[]): HideReason[] {
  const out: HideReason[] = children.map((c) =>
    c.primary || (c.n !== null && c.n < MIN_GROUP_SIZE) ? "primari" : null,
  );
  const counted = children.map((c, i) => ({ i, n: c.n })).filter((x) => x.n !== null);
  const hidden = counted.filter((x) => out[x.i] !== null);
  if (hidden.length === 0) return out;
  const hiddenSum = hidden.reduce((s, x) => s + (x.n as number), 0);
  if (hidden.length === 1 || hiddenSum < MIN_GROUP_SIZE) {
    const visible = counted.filter((x) => out[x.i] === null);
    if (visible.length) {
      const smallest = visible.reduce((a, b) => ((b.n as number) < (a.n as number) ? b : a));
      out[smallest.i] = "complementari";
    }
  }
  return out;
}

/**
 * Count to show next to an alarm, insight or headline. Company-wide rows keep the exact n. Rows scoped to a
 * collective or shift show only "≥10": exact counts of sibling segments would let a reader subtract them from the
 * parent and recover a suppressed segment (for example Logística night = 38 - 30). Only meaningful above the minimum.
 */
export function shownCount(n: number, scoped: boolean): string {
  return scoped ? `≥${MIN_GROUP_SIZE}` : String(n);
}

/** "n=30" for company-wide rows, "n≥10" for collective or shift rows (B3: no exact count that could expose a suppressed sibling). */
export function nLabel(n: number, scoped: boolean): string {
  return scoped ? `n≥${MIN_GROUP_SIZE}` : `n=${n}`;
}
