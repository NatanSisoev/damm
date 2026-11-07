// Learned per-item baseline (light item-response model). docs/engine.md section 2.

export interface ItemStats {
  bias: number;
  n: number;
  residSum: number;
}

export const EMPTY_ITEM: ItemStats = { bias: 0, n: 0, residSum: 0 };

/**
 * Adds one residual (score − person level before the update) and returns the shrunk bias
 * Σ residual / (n + k). With few answers the bias stays near 0.
 */
export function updateItemStats(prev: ItemStats, residual: number, shrinkage: number): ItemStats {
  const n = prev.n + 1;
  const residSum = prev.residSum + residual;
  return { n, residSum, bias: residSum / (n + shrinkage) };
}
