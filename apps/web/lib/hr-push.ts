// HR alarm notifications (server only). Sends a web push to every HR browser that opted in on
// /hr/settings when an analysis job run creates new warning or critical alarms. The payload holds
// alarm text only (aggregate outputs above the minimum group size), never a person or an answer.
import webpush from "web-push";
import type { Lang } from "@damm/shared";
import { deleteHrPushSubscription, listHrPushSubscriptions, listNewAlarms, type HrPushSubscription } from "@damm/db/hr";
import { makeT } from "@/lib/i18n/core";
import { hrDict } from "@/lib/i18n/hr";
import { pushEnabled } from "@/lib/push";
import { signalTrend } from "@/lib/signal-text";

export type HrPushOutcome = { status: "off" } | { status: "none" } | { status: "sent"; alarms: number; browsers: number };

const BODY_MAX = 160;

function payload(lang: Lang, afterId: number): string | null {
  const alarms = listNewAlarms(afterId, lang);
  if (!alarms.length) return null;
  const t = makeT(hrDict, lang);
  const text = signalTrend(alarms[0], lang)?.plain ?? alarms[0].descripcio;
  const first = text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text;
  const body = alarms.length > 1 ? `${first} (${t("hr_push_more", { n: alarms.length - 1 })})` : first;
  const title = alarms.length === 1 ? t("hr_push_title_one") : t("hr_push_title_many", { n: alarms.length });
  return JSON.stringify({ title, body, url: "/hr/signals" });
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
  const count = listNewAlarms(afterId).length;
  if (!count) return { status: "none" };
  const browsers = await send(listHrPushSubscriptions(), (lang) => payload(lang, afterId));
  return { status: "sent", alarms: count, browsers };
}

/** A test notification to one HR browser. */
export async function sendHrTestPush(sub: HrPushSubscription): Promise<boolean> {
  if (!pushEnabled()) return false;
  const t = makeT(hrDict, sub.lang);
  return (await send([sub], () => JSON.stringify({ title: t("hr_push_test_title"), body: t("hr_push_test_body"), url: "/hr/signals" }))) === 1;
}
