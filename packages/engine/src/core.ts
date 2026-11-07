// @damm/engine/core: the pure model, for tests, simulations and tuning. No database access.
export * from "./normalize.ts";
export * from "./person.ts";
export * from "./segment.ts";
export * from "./item-bias.ts";
export * from "./thompson.ts";
export * from "./batch.ts";
export * from "./learn.ts";
export * from "./rng.ts";
export { DEFAULT_CONFIG, ENGINE_VERSION, type EngineConfig, type Priors, type ClosedType } from "./config.ts";
