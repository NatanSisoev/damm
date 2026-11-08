// One engine and one scheduler per server process, on the app's shared DB connection.
// Cached on globalThis so dev hot reload does not create a second scheduler.
import { createEngine, type Engine } from "@damm/engine";
import { createComplete, startEngineScheduler, type EngineScheduler } from "@damm/engine/job";
import { getDb } from "@damm/db";
import { redactPii } from "@damm/db/employee";
import { reinstateAlarmsForReadingPeriod } from "@damm/db/hr";

type EngineDb = Parameters<typeof createEngine>[0]["db"];
const engineDb = () => getDb() as unknown as EngineDb;

const g = globalThis as { __engine?: Engine; __engineScheduler?: EngineScheduler };

export function getEngine(): Engine {
  return (g.__engine ??= createEngine({ db: engineDb(), redact: redactPii }));
}

export function getScheduler(): EngineScheduler {
  return (g.__engineScheduler ??= startEngineScheduler(engineDb(), {
    intervalMs: 10 * 60_000,
    // The narrative summary needs the LLM; without a key the scheduler skips it.
    narrative: process.env.LLM_API_KEY ? { complete: createComplete() } : undefined,
    // The engine suppresses alarms when the newest period is still thin; HR reads the latest readable period (R-PRIV-2).
    onReport: () => {
      try {
        reinstateAlarmsForReadingPeriod();
      } catch (e) {
        console.error("[engine] alarm reinstate failed", e);
      }
    },
    onError: (e) => console.error("[engine] job failed", e),
  }));
}
