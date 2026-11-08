// @damm/engine: employee-side API. HR code must import only @damm/engine/hr.
export { createEngine, EngineError } from "./engine.ts";
export type { Engine, EngineOptions, DailyBatch, BatchItem, CampaignSet, CampaignItem, AnswerInput, SubmitResult, RejectReason } from "./engine.ts";
export { ENGINE_VERSION } from "./config.ts";
export type { SqlDatabase } from "./db.ts";
