// Demo reset (N-17) for the HR settings page. Kept outside app/hr because it touches every table (the HR import rule
// allows only @damm/db/hr there). The flag check lives here, so the action is refused when it is off.
import { demoResetEnabled, hasSnapshot, resetDemo } from "@damm/db/demo";
import { invalidateHrPool } from "./hr-engine";

export { demoResetEnabled };
export const demoSnapshotReady = hasSnapshot;

export function resetDemoNow(): "done" | "nosnap" | "fail" {
  try {
    resetDemo();
    invalidateHrPool();
    return "done";
  } catch (e) {
    if (e instanceof Error && e.message === "no-snapshot") return "nosnap";
    console.error("[demo] reset failed", e);
    return "fail";
  }
}
