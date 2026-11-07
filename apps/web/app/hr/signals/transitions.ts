import type { AlarmStatus } from "@/lib/hr-engine";

/** Next statuses a person can set from each status (mirrors the engine's allowed transitions). */
export const ALARM_NEXT: Record<AlarmStatus, Exclude<AlarmStatus, "open">[]> = {
  open: ["acknowledged", "action_linked", "resolved"],
  acknowledged: ["action_linked", "resolved"],
  action_linked: ["resolved"],
  resolved: [],
};
