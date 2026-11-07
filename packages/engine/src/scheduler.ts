// Runs the engine job periodically inside the app's server process. docs/engine-integration.md, "Running the engine".
// The per-request work (daily batch, answer learning) needs no scheduler; only aggregates, insights and alarms do.
// Optionally runs the LLM narrative after a job, rate-limited, in the background.
import type { SqlDatabase } from "./db.ts";
import { runEngineJob, type JobOptions, type JobReport } from "./job.ts";
import type { Complete } from "./llm.ts";
import { runNarrative, type NarrativeReport } from "./narrative.ts";

export interface NarrativeSchedule {
  /** LLM completion function, e.g. createComplete() from @damm/engine/job. */
  complete: Complete;
  /** Minimum time between narrative runs. Default 6 hours. Unchanged inputs cost 0 calls anyway. */
  everyMs?: number;
  model?: string;
}

export interface SchedulerOptions extends Omit<JobOptions, "now"> {
  /** Time between runs. Default 10 minutes. */
  intervalMs?: number;
  /** Run once immediately on start. Default true. */
  runOnStart?: boolean;
  now?: () => number;
  onReport?: (report: JobReport) => void;
  onError?: (error: unknown) => void;
  /** Opt-in: LLM narrative insights after the job, at most every `everyMs`. Omit to never call the LLM. */
  narrative?: NarrativeSchedule;
  onNarrative?: (report: NarrativeReport) => void;
}

export interface EngineScheduler {
  /** Runs the job now (e.g. an HR "recalculate" button). Returns null if a run is already in progress. */
  runNow(): JobReport | null;
  /** Runs the narrative now, ignoring the rate limit. Resolves null if not configured or already running. */
  runNarrativeNow(): Promise<NarrativeReport | null>;
  lastReport(): JobReport | null;
  lastRunAt(): number | null;
  lastNarrativeAt(): number | null;
  stop(): void;
}

export const DEFAULT_INTERVAL_MS = 10 * 60_000;
export const DEFAULT_NARRATIVE_EVERY_MS = 6 * 60 * 60_000;

export function startEngineScheduler(db: SqlDatabase, opts: SchedulerOptions = {}): EngineScheduler {
  const { intervalMs = DEFAULT_INTERVAL_MS, runOnStart = true, now = Date.now, onReport, onError, narrative, onNarrative, ...jobOpts } = opts;
  if (!(intervalMs >= 1000)) throw new RangeError("intervalMs must be at least 1000");
  const report = (e: unknown, what: string) => (onError ? onError(e) : console.error(`[engine] ${what} failed`, e));
  let running = false;
  let last: JobReport | null = null;
  let lastAt: number | null = null;
  let narrativeRunning = false;
  let narrativeAt: number | null = null;
  let stopped = false;

  const startNarrative = (t: number): Promise<NarrativeReport | null> => {
    if (!narrative || narrativeRunning || stopped) return Promise.resolve(null);
    narrativeRunning = true;
    narrativeAt = t; // set at start so a slow or failing LLM is not retried on every tick
    return runNarrative(db, { now: t, complete: narrative.complete, model: narrative.model, config: jobOpts.config })
      .then((r) => {
        onNarrative?.(r);
        return r;
      })
      .catch((e) => {
        report(e, "narrative");
        return null;
      })
      .finally(() => {
        narrativeRunning = false;
      });
  };

  const runNow = (): JobReport | null => {
    if (running) return null;
    running = true;
    try {
      const t = now();
      last = runEngineJob(db, { ...jobOpts, now: t });
      lastAt = t;
      onReport?.(last);
      const every = narrative?.everyMs ?? DEFAULT_NARRATIVE_EVERY_MS;
      if (narrative && (narrativeAt === null || t - narrativeAt >= every)) void startNarrative(t);
      return last;
    } catch (e) {
      // A failed run never stops the scheduler: the next tick tries again.
      report(e, "job");
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
    runNarrativeNow: () => startNarrative(now()),
    lastReport: () => last,
    lastRunAt: () => lastAt,
    lastNarrativeAt: () => narrativeAt,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
