// Seeded randomness. Every random decision in the engine goes through an Rng so results are reproducible.

export type Rng = () => number; // uniform [0, 1)

/** FNV-1a 32-bit hash, used to derive seeds from strings like `${accountId}|${day}`. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for sampling decisions. */
export function createRng(seed: number | string): Rng {
  let a = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, xs: readonly T[]): T | undefined {
  return xs.length === 0 ? undefined : xs[Math.floor(rng() * xs.length)];
}

function standardNormal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1) by Marsaglia–Tsang. */
export function sampleGamma(rng: Rng, shape: number): number {
  if (shape < 1) return sampleGamma(rng, shape + 1) * Math.pow(rng() || Number.MIN_VALUE, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  return x / (x + y);
}

/** Draws k distinct keys with probability proportional to weight, without replacement. */
export function weightedSampleWithoutReplacement<K>(rng: Rng, items: { key: K; weight: number }[], k: number): K[] {
  const pool = items.filter((i) => i.weight > 0).map((i) => ({ ...i }));
  const out: K[] = [];
  while (out.length < k && pool.length > 0) {
    const total = pool.reduce((s, i) => s + i.weight, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx]!.key);
    pool.splice(idx, 1);
  }
  return out;
}
