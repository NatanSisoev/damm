import type { QuestionType } from "@damm/shared";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { all, run, transaction, type SqlDatabase } from "./db.ts";

export const ENGINE_VERSION = "0.1.0";

export type ClosedType = Exclude<QuestionType, "ranking" | "open">;

/**
 * Priors: what the engine believes before it has seen any data. This is the warm-start hook:
 * a prior pack fitted on external data (public surveys, a previous deployment, a simulation) is loaded
 * here and the engine then keeps learning online from real answers. See docs/engine.md, "Learning".
 */
export interface Priors {
  /** Prior mean level (0..1) for a person or segment with no data. */
  level: number;
  /** Prior variance of a new person's level. */
  variance: number;
  /** Optional per-domain prior level, keyed by domini_id. */
  domainLevel: Record<string, number>;
  /** Prior Beta(alpha, beta) for format "good answer" rates, per type. Missing = Beta(1, 1). */
  formatBeta: Partial<Record<QuestionType, [number, number]>>;
}

export interface EngineConfig {
  questionsPerDay: number;
  halfLifeDays: number;
  seTolerance: number;
  smallSampleVariance: number;
  followupZ: number;
  followupMinDays: number;
  followupMaxDays: number;
  followupInflation: number;
  confirmSigmas: number;
  processNoisePerDay: number;
  itemCooldownDays: number;
  minAnswerMs: number;
  domainFloor: number;
  outlierZ: number;
  /** Types precise enough for a single answer to trigger a follow-up. */
  followupTriggerTypes: ClosedType[];
  outlierBoost: number;
  outlierWindowDays: number;
  maxNeedsPerDay: number;
  itemBiasShrinkage: number;
  minGroupSize: number;
  timezone: string;
  /** Observation noise (sd on the 0..1 scale) per closed type. */
  noiseSd: Record<ClosedType, number>;
  priors: Priors;
}

export const DEFAULT_CONFIG: EngineConfig = {
  questionsPerDay: 3,
  halfLifeDays: 21,
  seTolerance: 0.05,
  smallSampleVariance: 0.01,
  followupZ: 2.5,
  followupMinDays: 3,
  followupMaxDays: 7,
  followupInflation: 0.02,
  confirmSigmas: 2,
  processNoisePerDay: 0.0005,
  itemCooldownDays: 28,
  minAnswerMs: 1500,
  domainFloor: 0.15,
  outlierZ: 2,
  followupTriggerTypes: ["scale10", "scale5", "choice"],
  outlierBoost: 0.5,
  outlierWindowDays: 14,
  maxNeedsPerDay: 1,
  itemBiasShrinkage: 20,
  minGroupSize: MIN_GROUP_SIZE,
  timezone: "Europe/Madrid",
  noiseSd: { scale10: 0.1, scale5: 0.12, yes_no: 0.25, pair: 0.22, choice: 0.17 },
  priors: { level: 0.6, variance: 0.04, domainLevel: {}, formatBeta: {} },
};

// engine_config keys are snake_case; values are JSON.
const KEY_MAP: Record<string, keyof EngineConfig> = {
  questions_per_day: "questionsPerDay",
  half_life_days: "halfLifeDays",
  se_tolerance: "seTolerance",
  small_sample_variance: "smallSampleVariance",
  followup_z: "followupZ",
  followup_min_days: "followupMinDays",
  followup_max_days: "followupMaxDays",
  followup_inflation: "followupInflation",
  confirm_sigmas: "confirmSigmas",
  process_noise_per_day: "processNoisePerDay",
  item_cooldown_days: "itemCooldownDays",
  min_answer_ms: "minAnswerMs",
  domain_floor: "domainFloor",
  outlier_z: "outlierZ",
  followup_trigger_types: "followupTriggerTypes",
  outlier_boost: "outlierBoost",
  outlier_window_days: "outlierWindowDays",
  max_needs_per_day: "maxNeedsPerDay",
  item_bias_shrinkage: "itemBiasShrinkage",
  timezone: "timezone",
  noise_sd: "noiseSd",
  priors: "priors",
};
/** Keys the engine writes itself; readable, not settable. */
const READ_ONLY_KEYS = new Set(["engine_version", "last_job_at"]);

export class ConfigError extends Error {}

function coerce(key: keyof EngineConfig, value: unknown): EngineConfig[keyof EngineConfig] {
  const def = DEFAULT_CONFIG[key];
  if (typeof def === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ConfigError(`${key} must be a non-negative number`);
    return value;
  }
  if (typeof def === "string") {
    if (typeof value !== "string" || value.length === 0) throw new ConfigError(`${key} must be a string`);
    return value;
  }
  if (key === "followupTriggerTypes") {
    const ok = Array.isArray(value) && value.every((t) => typeof t === "string" && t in DEFAULT_CONFIG.noiseSd);
    if (!ok) throw new ConfigError("followup_trigger_types must be a list of closed question types");
    return value as ClosedType[];
  }
  if (key === "noiseSd") {
    if (typeof value !== "object" || value === null) throw new ConfigError("noise_sd must be an object");
    const merged = { ...DEFAULT_CONFIG.noiseSd, ...(value as object) };
    for (const v of Object.values(merged)) if (typeof v !== "number" || v <= 0) throw new ConfigError("noise_sd values must be > 0");
    return merged;
  }
  if (typeof value !== "object" || value === null) throw new ConfigError("priors must be an object");
  const p = { ...DEFAULT_CONFIG.priors, ...(value as Partial<Priors>) };
  if (p.level < 0 || p.level > 1 || p.variance <= 0) throw new ConfigError("priors.level must be in 0..1 and priors.variance > 0");
  return p;
}

export function loadConfig(db: SqlDatabase): EngineConfig {
  const cfg: EngineConfig = structuredClone(DEFAULT_CONFIG);
  for (const row of all<{ key: string; value: string }>(db, "SELECT key, value FROM engine_config")) {
    const k = KEY_MAP[row.key];
    if (!k) continue;
    try {
      (cfg as unknown as Record<string, unknown>)[k] = coerce(k, JSON.parse(row.value));
    } catch {
      // A bad stored value falls back to the default instead of breaking the app.
    }
  }
  return cfg;
}

/** Raw engine_config rows, including read-only keys such as engine_version. */
export function getConfig(db: SqlDatabase): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of all<{ key: string; value: string }>(db, "SELECT key, value FROM engine_config")) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

/** Validates and stores config keys (snake_case). Unknown or read-only keys are rejected. */
export function setConfig(db: SqlDatabase, patch: Record<string, unknown>): void {
  const entries = Object.entries(patch).map(([key, value]) => {
    const k = KEY_MAP[key];
    if (!k || READ_ONLY_KEYS.has(key)) throw new ConfigError(`unknown config key: ${key}`);
    return [key, JSON.stringify(coerce(k, value))] as const;
  });
  transaction(db, () => {
    for (const [key, value] of entries)
      run(db, "INSERT INTO engine_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  });
}

export function writeSystemKey(db: SqlDatabase, key: string, value: unknown): void {
  run(db, "INSERT INTO engine_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
}

/** Config with overrides applied. Nested objects (noise per type, priors) are merged key by key, not replaced. */
export function mergeConfig(base: EngineConfig, override: Partial<EngineConfig> | undefined): EngineConfig {
  if (!override) return base;
  const { noiseSd, priors, ...flat } = override;
  return {
    ...base,
    ...flat,
    noiseSd: { ...base.noiseSd, ...noiseSd },
    priors: {
      ...base.priors,
      ...priors,
      domainLevel: { ...base.priors.domainLevel, ...priors?.domainLevel },
      formatBeta: { ...base.priors.formatBeta, ...priors?.formatBeta },
    },
  };
}

export const resolveConfig = (db: SqlDatabase, override?: Partial<EngineConfig>): EngineConfig => mergeConfig(loadConfig(db), override);

const SNAKE_OF = Object.fromEntries(Object.entries(KEY_MAP).map(([snake, camel]) => [camel, snake])) as Record<keyof EngineConfig, string>;

export interface ConfigEntry {
  /** engine_config key (snake_case): what setConfig accepts. */
  key: string;
  /** Value the engine uses now. */
  value: unknown;
  /** Built-in default. */
  default: unknown;
  /** True when HR stored a value that differs from the default. */
  overridden: boolean;
}

/** Every tunable parameter with its effective value, its default and whether HR changed it. */
export function describeConfig(db: SqlDatabase): ConfigEntry[] {
  const cfg = loadConfig(db);
  return (Object.keys(KEY_MAP).map((k) => KEY_MAP[k]!) as (keyof EngineConfig)[]).map((camel) => ({
    key: SNAKE_OF[camel],
    value: cfg[camel],
    default: DEFAULT_CONFIG[camel],
    overridden: JSON.stringify(cfg[camel]) !== JSON.stringify(DEFAULT_CONFIG[camel]),
  }));
}

/** Drops stored values so the built-in defaults apply again. No keys = reset everything HR can set. */
export function resetConfig(db: SqlDatabase, keys?: string[]): void {
  const target = keys ?? Object.keys(KEY_MAP);
  for (const key of target) if (!KEY_MAP[key] || READ_ONLY_KEYS.has(key)) throw new ConfigError(`unknown config key: ${key}`);
  transaction(db, () => {
    for (const key of target) run(db, "DELETE FROM engine_config WHERE key = ?", key);
  });
}

/** Validates a snake_case patch like setConfig does, but returns it as an override instead of storing it (what-if runs). */
export function parseConfigPatch(patch: Record<string, unknown>): Partial<EngineConfig> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const k = KEY_MAP[key];
    if (!k || READ_ONLY_KEYS.has(key)) throw new ConfigError(`unknown config key: ${key}`);
    out[k] = coerce(k, value);
  }
  return out as Partial<EngineConfig>;
}
