// Web push sender (server only). Employee-side: it reads push subscriptions through
// @damm/db/employee. HR code calls notifyNeedPublished() with a need id and gets back an
// aggregate outcome only (a device count, "<10" under the minimum group size): never an
// account id, endpoint or key.
import webpush from "web-push";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { deletePushSubscriptionByEndpoint, listPushTargetsForNecessitat } from "@damm/db/employee";

export type PushOutcome =
  | { status: "off" } // VAPID keys not configured: publishing still works, nobody is notified
  | { status: "sent"; devices: number | `<${number}` };

let configured: boolean | null = null;

/** The VAPID public key for the browser's subscribe call, or null when push is off. */
export function vapidPublicKey(): string | null {
  return pushEnabled() ? process.env.VAPID_PUBLIC_KEY! : null;
}

export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(vapidSubject(), pub, priv);
    configured = true;
  } catch (e) {
    console.warn("[push] invalid VAPID configuration, notifications are off:", (e as Error).message);
    configured = false;
  }
  return configured;
}

/**
 * VAPID subject (the sender contact). Apple's push service rejects reserved domains such as
 * example.invalid with 403 BadJwtToken, so prefer VAPID_SUBJECT, then the public https origin.
 */
function vapidSubject(): string {
  const set = process.env.VAPID_SUBJECT?.trim();
  if (set && !/\.invalid\b|localhost/i.test(set)) return set;
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (base?.startsWith("https://")) return base;
  return set || "mailto:escolta@example.com";
}

const PAYLOAD = JSON.stringify({
  title: "Escolta activa",
  body: "Tens preguntes noves. Només et prendrà un minut.",
  url: "/",
});

/** Notifies every subscribed device in the need's collective (all collectives if it has none). */
export async function notifyNeedPublished(necessitatId: number): Promise<PushOutcome> {
  if (!pushEnabled()) return { status: "off" };
  const targets = listPushTargetsForNecessitat(necessitatId);
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, PAYLOAD, { TTL: 60 * 60 * 24 }),
    ),
  );
  let delivered = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      delivered++;
      return;
    }
    const code = (r.reason as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) deletePushSubscriptionByEndpoint(targets[i].endpoint);
    else console.warn("[push] send failed:", code ?? (r.reason as Error)?.message);
  });
  return { status: "sent", devices: delivered < MIN_GROUP_SIZE ? `<${MIN_GROUP_SIZE}` : delivered };
}
