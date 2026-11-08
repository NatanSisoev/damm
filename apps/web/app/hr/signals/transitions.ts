import type { AlarmStatus } from "@/lib/hr-engine";

/** Next statuses a person can set from each status (mirrors the engine's allowed transitions). */
export const ALARM_NEXT: Record<AlarmStatus, Exclude<AlarmStatus, "open">[]> = {
  open: ["acknowledged", "action_linked", "resolved", "dismissed"],
  acknowledged: ["action_linked", "resolved", "dismissed"],
  action_linked: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};
