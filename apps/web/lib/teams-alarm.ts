// Critical alarms to a Teams channel (server only), next to the HR web push. Called by the analysis job with the
// same "newer than this id" cut as the push, so a re-run never repeats an alarm. Content is the aggregate alarm
// only (segment, delta, confidence, reason): nothing below the minimum group size, nothing about a person.
// A missing, slow or failing webhook is logged without the URL and never fails the job.
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { listNewCriticalAlarms, type NewCriticalAlarm } from "@damm/db/hr";
import { makeT } from "@/lib/i18n/core";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { alarmConfidence, alarmReason } from "@/lib/alarm-reason";
import { signalHeadline, signalTrend } from "@/lib/signal-text";
import { teamsMessage, type AdaptiveCard } from "@/app/hr/publish/teams-card";

export type TeamsAlarmOutcome =
  | { status: "off" }
  | { status: "none" }
  | { status: "sent"; alarms: number; posts: number; failed: number };

/** Cards per job run; the last one says how many more there are. */
const MAX_CARDS = 5;
const TIMEOUT_MS = 5_000;

/** TEAMS_ALARM_WEBHOOK_URL, else the publish card's TEAMS_WEBHOOK_URL. */
export function teamsAlarmHook(): string | null {
  return process.env.TEAMS_ALARM_WEBHOOK_URL?.trim() || process.env.TEAMS_WEBHOOK_URL?.trim() || null;
}

const baseUrl = () => (process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

/** Adaptive Card for one critical alarm. Pure. `more` = further critical alarms of this run that got no card. */
export function buildAlarmCard(a: NewCriticalAlarm, opts: { lang?: Lang; baseUrl?: string; more?: number } = {}): AdaptiveCard {
  const lang = opts.lang ?? "ca";
  const t = makeT(hrResultsDict, lang);
  const typeKey = `tca_type_${a.tipus}` as const;
  const typeLabel = typeKey in hrResultsDict[lang] ? t(typeKey as "tca_type_sharp_drop") : a.tipus;
  const trend = signalTrend(a, lang)?.plain ?? null;
  const conf = alarmConfidence(a.confianca);
  const reason = alarmReason({ tipus: a.tipus, descripcio: a.descripcio, severity: a.severity, n: a.n, confidence: a.confianca }, lang);
  const fact = (title: string, value: string) => ({ title, value });
  const facts = [
    fact(t("tca_segment"), signalHeadline(a, lang)),
    fact(t("tca_period"), a.periode),
    ...(trend ? [fact(t("tca_change"), trend)] : []),
    ...(conf !== null ? [fact(t("tca_conf"), lang === "en" ? `${conf}%` : `${conf} %`)] : []),
  ];
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: t("tca_title"), weight: "Bolder", size: "Large", color: "Attention", wrap: true },
    { type: "TextBlock", text: typeLabel, weight: "Bolder", spacing: "None", wrap: true },
    { type: "FactSet", facts },
    ...(reason ? [{ type: "TextBlock", text: reason, wrap: true }] : []),
    { type: "TextBlock", text: t("tca_privacy", { min: MIN_GROUP_SIZE }), isSubtle: true, size: "Small", wrap: true },
    ...(opts.more ? [{ type: "TextBlock", text: t("tca_more", { n: opts.more }), isSubtle: true, size: "Small", wrap: true }] : []),
  ];
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
    actions: [{ type: "Action.OpenUrl", title: t("tca_action"), url: `${opts.baseUrl ?? baseUrl()}/hr/signals/${a.id}` }],
  };
}

async function post(hook: string, card: AdaptiveCard): Promise<boolean> {
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsMessage(card)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn("[teams-alarm] webhook answered", res.status);
    return res.ok;
  } catch (e) {
    // Never log the error object or the URL: some runtimes put the URL in the message.
    console.warn("[teams-alarm] webhook unreachable:", (e as Error)?.name ?? "error");
    return false;
  }
}

/** Posts one card per critical alarm created after `afterId` (taken before the job ran). Never throws. */
export async function notifyTeamsNewAlarms(afterId: number): Promise<TeamsAlarmOutcome> {
  try {
    const hook = teamsAlarmHook();
    if (!hook) return { status: "off" };
    const alarms = listNewCriticalAlarms(afterId);
    if (!alarms.length) return { status: "none" };
    const shown = alarms.slice(0, MAX_CARDS);
    const more = alarms.length - shown.length;
    let posts = 0;
    for (const [i, a] of shown.entries()) {
      // A failing or slow hook is not retried for the rest of the run: the job must not wait 5 s per card.
      if (await post(hook, buildAlarmCard(a, { more: i === shown.length - 1 ? more : 0 }))) posts++;
      else break;
    }
    return { status: "sent", alarms: alarms.length, posts, failed: shown.length - posts };
  } catch (e) {
    console.warn("[teams-alarm] failed:", (e as Error)?.name ?? "error");
    return { status: "none" };
  }
}
