"use client";

import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { hrDashboardDict } from "@/lib/i18n/hr-dashboard";

/** Submit button for the dashboard refresh: the server action can take a while when it rewrites the AI summary. */
export function RefreshButton() {
  const { pending } = useFormStatus();
  const t = useT(hrDashboardDict);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn" title={t("dash_refresh_title")}>
      <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={pending ? "gen-spinner-svg" : ""}>
        <path d="M20 12a8 8 0 11-2.3-5.6M20 4v4h-4" />
      </svg>
      {pending ? t("dash_refreshing") : t("dash_refresh")}
    </button>
  );
}
