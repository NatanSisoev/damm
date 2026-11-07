// One engine and one scheduler per server process, on the app's shared DB connection.
// Cached on globalThis so dev hot reload does not create a second scheduler.
import { createEngine, type Engine } from "@damm/engine";
import { startEngineScheduler, type EngineScheduler } from "@damm/engine/job";
import { getDb } from "@damm/db";
import { redactPii } from "@damm/db/employee";

type EngineDb = Parameters<typeof createEngine>[0]["db"];
const engineDb = () => getDb() as unknown as EngineDb;

const g = globalThis as { __engine?: Engine; __engineScheduler?: EngineScheduler };

export function getEngine(): Engine {
  return (g.__engine ??= createEngine({ db: engineDb(), redact: redactPii }));
}

export function getScheduler(): EngineScheduler {
  return (g.__engineScheduler ??= startEngineScheduler(engineDb(), {
    intervalMs: 10 * 60_000,
    onError: (e) => console.error("[engine] job failed", e),
  }));
}
