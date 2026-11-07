// Runs the engine job periodically inside the app's server process. docs/engine-integration.md, "Running the engine".
// The per-request work (daily batch, answer learning) needs no scheduler; only aggregates, insights and alarms do.
import type { SqlDatabase } from "./db.ts";
import { runEngineJob, type JobOptions, type JobReport } from "./job.ts";

export interface SchedulerOptions extends Omit<JobOptions, "now"> {
  /** Time between runs. Default 10 minutes. */
  intervalMs?: number;
  /** Run once immediately on start. Default true. */
  runOnStart?: boolean;
  now?: () => number;
  onReport?: (report: JobReport) => void;
  onError?: (error: unknown) => void;
}

export interface EngineScheduler {
  /** Runs the job now (e.g. an HR "recalculate" button). Returns null if a run is already in progress. */
  runNow(): JobReport | null;
  lastReport(): JobReport | null;
  lastRunAt(): number | null;
  stop(): void;
}

export const DEFAULT_INTERVAL_MS = 10 * 60_000;

export function startEngineScheduler(db: SqlDatabase, opts: SchedulerOptions = {}): EngineScheduler {
  const { intervalMs = DEFAULT_INTERVAL_MS, runOnStart = true, now = Date.now, onReport, onError, ...jobOpts } = opts;
  if (!(intervalMs >= 1000)) throw new RangeError("intervalMs must be at least 1000");
  let running = false;
  let last: JobReport | null = null;
  let lastAt: number | null = null;

  const runNow = (): JobReport | null => {
    if (running) return null;
    running = true;
    try {
      const t = now();
      last = runEngineJob(db, { ...jobOpts, now: t });
      lastAt = t;
      onReport?.(last);
      return last;
    } catch (e) {
      // A failed run never stops the scheduler: the next tick tries again.
      onError ? onError(e) : console.error("[engine] job failed", e);
      return null;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(runNow, intervalMs);
  // Do not keep the process alive just for the scheduler.
  (timer as { unref?: () => void }).unref?.();
  if (runOnStart) runNow();

  return {
    runNow,
    lastReport: () => last,
    lastRunAt: () => lastAt,
    stop: () => clearInterval(timer),
  };
}
