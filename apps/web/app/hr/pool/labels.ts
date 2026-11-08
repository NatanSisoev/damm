import type { PoolReason, PoolState } from "@/lib/hr-engine";
import type { PoolKey } from "@/lib/i18n/hr-pool";

/** Dictionary keys (see lib/i18n/hr-pool.ts) plus the badge class for each pool state. */
export const STATE: Record<PoolState, { key: PoolKey; cls: string }> = {
  live: { key: "st_live", cls: "badge-good" },
  waiting: { key: "st_waiting", cls: "badge-accent" },
  inactive: { key: "st_inactive", cls: "" },
};

export const REASON: Record<PoolReason, PoolKey> = {
  live: "re_live",
  need_done: "re_need_done",
  followup_only: "re_followup_only",
  draft: "re_draft",
  need_unpublished: "re_need_unpublished",
  need_closed: "re_need_closed",
  retired: "re_retired",
};
