// HR alarm notifications: browser subscriptions of the HR portal and the new alarms a job run created.
// No account ids and no per-person rows: alarms are aggregate outputs that already passed the minimum group size.
import type { Lang } from "@damm/shared";
import { getDb } from "./connection";
import { overlayTranslations } from "./hr-i18n";

export interface HrPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: Lang;
}

export interface NewAlarm {
  id: number;
  descripcio: string;
  tipus: string;
  periode: string;
  severity: "warning" | "critical";
}

export function saveHrPushSubscription(s: HrPushSubscription): void {
  getDb()
    .prepare(
      `INSERT INTO hr_push_subscription (endpoint, p256dh, auth, lang) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang`,
    )
    .run(s.endpoint, s.p256dh, s.auth, s.lang);
}

export function deleteHrPushSubscription(endpoint: string): void {
  getDb().prepare("DELETE FROM hr_push_subscription WHERE endpoint = ?").run(endpoint);
}

export function listHrPushSubscriptions(): HrPushSubscription[] {
  return getDb().prepare("SELECT endpoint, p256dh, auth, lang FROM hr_push_subscription").all() as HrPushSubscription[];
}

export function hasHrPushSubscription(endpoint: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM hr_push_subscription WHERE endpoint = ?").get(endpoint);
}

/** Highest alarm id so far; the job takes it before running so it can tell which alarms are new. */
export function maxAlarmId(): number {
  return (getDb().prepare("SELECT COALESCE(MAX(id), 0) AS m FROM senyal").get() as { m: number }).m;
}

/** Open, unsuppressed warning and critical alarms created after `afterId`, critical first, text in `lang`. */
export function listNewAlarms(afterId: number, lang: Lang = "ca"): NewAlarm[] {
  const rows = getDb()
    .prepare(
      `SELECT id, descripcio, tipus, periode, severity FROM senyal
       WHERE id > ? AND suprimit = 0 AND COALESCE(status, 'open') = 'open'
         AND severity IN ('warning','critical') AND COALESCE(audience, 'hr') IN ('hr','hr_manager')
       ORDER BY severity = 'critical' DESC, id`,
    )
    .all(afterId) as NewAlarm[];
  return overlayTranslations(getDb(), "senyal", rows, { descripcio: "descripcio" }, lang);
}
