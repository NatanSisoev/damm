"use client";
import { useT } from "@/lib/i18n/client";
import { panelDict } from "@/lib/i18n/hr-panel";

import { useFormStatus } from "react-dom";

/** Submit button for the dashboard refresh: the server action can take a while when it rewrites the AI summary. */
export function RefreshButton() {
  const t = useT(panelDict);
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="btn" title={t("refresh_title")}>
      <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={pending ? "gen-spinner-svg" : ""}>
        <path d="M20 12a8 8 0 11-2.3-5.6M20 4v4h-4" />
      </svg>
      {pending ? t("refresh_busy") : t("refresh")}
    </button>
  );
}
