// One engine and one scheduler per server process, on the app's shared DB connection.
// Cached on globalThis so dev hot reload does not create a second scheduler.
import { createEngine, type Engine } from "@damm/engine";
import { createComplete, startEngineScheduler, type EngineScheduler } from "@damm/engine/job";
import { getDb } from "@damm/db";
import { addPublishedNeedsToDay, redactPii } from "@damm/db/employee";

type EngineDb = Parameters<typeof createEngine>[0]["db"];
const engineDb = () => getDb() as unknown as EngineDb;

const g = globalThis as { __engine?: Engine; __engineScheduler?: EngineScheduler };

export function getEngine(): Engine {
  return (g.__engine ??= createEngine({ db: engineDb(), redact: redactPii }));
}

/**
 * Today's batch for an account, plus the unanswered questions of every published HR need for its
 * collective, even past the daily cap. The engine freezes a day's batch when it is first built,
 * so a need published later would otherwise wait until tomorrow.
 */
export function getTodaysBatch(compteId: string) {
  const engine = getEngine();
  const batch = engine.getDailyBatch(compteId);
  return addPublishedNeedsToDay(compteId, batch.day) > 0 ? engine.getDailyBatch(compteId) : batch;
}

export function getScheduler(): EngineScheduler {
  return (g.__engineScheduler ??= startEngineScheduler(engineDb(), {
    intervalMs: 10 * 60_000,
    // The narrative summary needs the LLM; without a key the scheduler skips it.
    narrative: process.env.LLM_API_KEY ? { complete: createComplete() } : undefined,
    onError: (e) => console.error("[engine] job failed", e),
  }));
}
