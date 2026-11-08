// Labels (ca/es/en) for senyal type, severity and status (C1: engine alarms add new types and both fields).
import type { Lang } from "@damm/shared";
import { signalHeadline, type SignalLike } from "@/lib/signal-text";
import { SignalSummary } from "@/components/signal-trend-line";
import { getLang } from "@/lib/lang";
import { hrDict, hrLookup } from "@/lib/i18n/hr";

const SEVERITY_CLS: Record<string, string> = { info: "", warning: "badge-warn", critical: "badge-crit" };

/** Catalan labels (compat for callers that do not pass a language yet; prefer `statusLabel`). */
export const STATUS_LABELS: Record<string, string> = {
  open: hrDict.ca.sst_open,
  acknowledged: hrDict.ca.sst_acknowledged,
  action_linked: hrDict.ca.sst_action_linked,
  resolved: hrDict.ca.sst_resolved,
  dismissed: hrDict.ca.sst_dismissed,
};

export const statusLabel = (status: string, lang: Lang = "ca") => hrLookup("sst_", status, lang);

/** Statuses a person can move a signal to, in order. */
export const STATUS_ORDER = ["open", "acknowledged", "action_linked", "resolved", "dismissed"] as const;

export const signalTypeLabel = (tipus: string, lang: Lang = "ca") => hrLookup("sig_", tipus, lang);

/** Type badge plus severity and status when the engine set them. */
export async function SignalBadges({ tipus, severity, status }: { tipus: string; severity?: string | null; status?: string | null }) {
  const lang = await getLang();
  const sevCls = severity ? SEVERITY_CLS[severity] : undefined;
  return (
    <>
      <span className={`badge ${tipus === "improvement" ? "badge-good" : "badge-warn"}`}>{signalTypeLabel(tipus, lang)}</span>
      {severity && sevCls !== undefined && <span className={`badge ${sevCls}`}>{hrLookup("sev_", severity, lang)}</span>}
      {status && <span className="badge">{statusLabel(status, lang)}</span>}
    </>
  );
}

/** Headline (domain, who) first, then what moved. Shared by every card that shows a signal. */
export async function SignalText({ s }: { s: SignalLike }) {
  const lang = await getLang();
  return (
    <>
      <p className="text-[14px] font-semibold">{signalHeadline(s, lang)}</p>
      <p className="mt-0.5 text-[13px] text-muted"><SignalSummary s={s} lang={lang} /></p>
    </>
  );
}
