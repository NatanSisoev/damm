// DEMO ONLY, off unless DEMO_LIVE_JOB=1. After a phone answer is stored, the analysis job runs in the background so
// the engine itself decides whether the answer tips a primed segment into an alarm, and HR browsers get the web push
// seconds later. Unlike DEMO_TRIPWIRE nothing is staged: the alarm comes from the normal engine job on real aggregates.
// The answer response never waits for it. Nothing here reads or stores who answered; the job only sees the normal
// `resposta` rows, exactly like a scheduled run.
import { getDb } from "@damm/db";
import { listNewAlarms, maxAlarmId, reinstateAlarmsForReadingPeriod } from "@damm/db/hr";
import { runEngineJob, runRecommendations } from "@damm/engine/job";
import { templateRecommendations } from "@damm/ai";
import { alarmPayload, notifyNewAlarms } from "@/lib/hr-push";
import { invalidateHrMemo } from "@/lib/hr-memo";
import { fireDemoAlarmForAnyAnswer } from "@/lib/demo-tripwire";

const DEBOUNCE_MS = Number(process.env.DEMO_LIVE_JOB_DEBOUNCE_MS ?? 1500);

type EngineDb = Parameters<typeof runEngineJob>[0];
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

export const liveJobEnabled = () => process.env.DEMO_LIVE_JOB === "1";

/** Call after a successful submit. Never throws and never blocks the response. */
let loggedOff = false;
export function scheduleLiveJob(): void {
  if (!liveJobEnabled()) {
    if (!loggedOff) {
      loggedOff = true;
      console.log(`[demo-live-job] answer stored but DEMO_LIVE_JOB is "${process.env.DEMO_LIVE_JOB ?? ""}" (needs "1"): no alarm will run`);
    }
    return;
  }
  console.log(`[demo-live-job] answer stored, ${running ? "run in progress, queued one more pass" : `run scheduled in ${DEBOUNCE_MS} ms`}`);
  if (running) {
    again = true; // an answer landed mid-run: one more pass after it, not one per answer
    return;
  }
  if (timer) clearTimeout(timer); // debounce: a burst of answers is one run
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, DEBOUNCE_MS);
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  try {
    do {
      again = false;
      const t0 = Date.now();
      const db = getDb() as unknown as EngineDb;
      const now = Date.now();
      const before = maxAlarmId();
      runEngineJob(db, { now });
      reinstateAlarmsForReadingPeriod();
      // Template proposals only: no LLM call, so the run stays a couple of seconds.
      await runRecommendations(db, { now, draft: async (ctx) => templateRecommendations(ctx) });
      invalidateHrMemo();
      // Log what HR browsers get (alarm text only, aggregate): lets a rehearsal without push keys see the payload.
      const payload = alarmPayload(listNewAlarms(before), "en");
      const push = await notifyNewAlarms(before);
      // The engine found nothing new for this answer: open the staged "Demo:" alarm so any answer reaches the laptop.
      if (!payload) {
        const staged = await fireDemoAlarmForAnyAnswer();
        console.log(`[demo-live-job] engine found no new alarm, staged fallback: ${staged}`);
      }
      console.log(`[demo-live-job] done in ${Date.now() - t0} ms, new alarms after #${before}, push: ${JSON.stringify(push)}, payload: ${payload ?? "none"}`);
    } while (again);
  } catch (e) {
    console.warn("[demo-live-job] failed:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}
