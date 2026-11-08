// HR alarm notifications (server only). Sends a web push to every HR browser that opted in on
// /hr/settings when an analysis job run creates new warning or critical alarms. The payload holds
// alarm text only (aggregate outputs above the minimum group size), never a person or an answer.
import webpush from "web-push";
import type { Lang } from "@damm/shared";
import { deleteHrPushSubscription, listHrPushSubscriptions, listNewAlarms, type HrPushSubscription, type NewAlarm } from "@damm/db/hr";
import { makeT } from "@/lib/i18n/core";
import { hrDict, hrLookup } from "@/lib/i18n/hr";
import { pushEnabled } from "@/lib/push";
import { signalHeadline } from "@/lib/signal-text";

export type HrPushOutcome = { status: "off" } | { status: "none" } | { status: "sent"; alarms: number; browsers: number };

/**
 * One notification per browser for a run. One alarm: "Critical: Leadership · Logistics, morning shift" opening that
 * alarm. Several: a count, the most severe one named, opening the list. Domain, segment, type and severity only,
 * no figures and no counts; `listNewAlarms` already left out groups under the minimum group size.
 */
export function alarmPayload(alarms: NewAlarm[], lang: Lang): string | null {
  if (!alarms.length) return null;
  const t = makeT(hrDict, lang);
  const top = alarms[0];
  const headline = `${hrLookup("sev_", top.severity, lang)}: ${signalHeadline(top, lang)}`;
  const type = hrLookup("sig_", top.tipus, lang);
  if (alarms.length === 1) return JSON.stringify({ title: headline, body: type, url: `/hr/signals/${top.id}` });
  return JSON.stringify({
    title: t("hr_push_title_many", { n: alarms.length }),
    body: `${headline} (${t("hr_push_more", { n: alarms.length - 1 })})`,
    url: "/hr/signals",
  });
}

async function send(subs: HrPushSubscription[], bodyFor: (lang: Lang) => string | null): Promise<number> {
  const cache = new Map<Lang, string | null>();
  const jobs = subs.map((s) => {
    if (!cache.has(s.lang)) cache.set(s.lang, bodyFor(s.lang));
    const body = cache.get(s.lang);
    if (!body) return Promise.resolve(false);
    return webpush
      .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 })
      .then(() => true)
      .catch((e: { statusCode?: number; message?: string }) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) deleteHrPushSubscription(s.endpoint);
        else console.warn("[hr-push] send failed:", e?.statusCode ?? e?.message);
        return false;
      });
  });
  return (await Promise.all(jobs)).filter(Boolean).length;
}

/** Notifies HR browsers about the alarms created after `afterId` (taken before the job ran). */
export async function notifyNewAlarms(afterId: number): Promise<HrPushOutcome> {
  if (!pushEnabled()) return { status: "off" };
  const alarms = listNewAlarms(afterId);
  if (!alarms.length) return { status: "none" };
  const browsers = await send(listHrPushSubscriptions(), (lang) => alarmPayload(alarms, lang));
  return { status: "sent", alarms: alarms.length, browsers };
}

/** A test notification to one HR browser. */
export async function sendHrTestPush(sub: HrPushSubscription): Promise<boolean> {
  if (!pushEnabled()) return false;
  const t = makeT(hrDict, sub.lang);
  return (await send([sub], () => JSON.stringify({ title: t("hr_push_test_title"), body: t("hr_push_test_body"), url: "/hr/signals" }))) === 1;
}
