// HR alarm notifications: browser subscriptions of the HR portal and the new alarms a job run created.
// No account ids and no per-person rows: alarms are aggregate outputs that already passed the minimum group size.
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";
import type { Lang } from "@damm/shared";

export interface HrPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: Lang;
}

/** Structured fields only (no engine text, no figures): the web layer words the notification from these. */
export interface NewAlarm {
  id: number;
  tipus: string;
  severity: "warning" | "critical";
  domini: string | null;
  collectiu: string | null;
  torn: string | null;
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

/**
 * Open, unsuppressed warning and critical alarms for HR created after `afterId`, critical first.
 * Alarms whose group is under the minimum group size are never listed. Names are the canonical (Catalan) reference names.
 */
export function listNewAlarms(afterId: number): NewAlarm[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.severity, d.nom AS domini, c.nom AS collectiu, t.nom AS torn
       FROM senyal s
       LEFT JOIN domini d ON d.id = s.domini_id
       LEFT JOIN collectiu c ON c.id = s.collectiu_id
       LEFT JOIN torn t ON t.id = s.torn_id
       WHERE s.id > ? AND s.suprimit = 0 AND s.n >= ? AND COALESCE(s.status, 'open') = 'open'
         AND s.severity IN ('warning','critical') AND COALESCE(s.audience, 'hr') IN ('hr','hr_manager')
       ORDER BY s.severity = 'critical' DESC, s.id`,
    )
    .all(afterId, MIN_GROUP_SIZE) as unknown as NewAlarm[];
}

export interface NewCriticalAlarm {
  id: number;
  tipus: string;
  /** The engine's own sentence (English): callers read the figures from it, as the HR pages do. */
  descripcio: string;
  periode: string;
  severity: "critical";
  n: number;
  confianca: number | null;
  /** Reference names (stable keys), null when the alarm is not scoped to it. */
  collectiu: string | null;
  domini: string | null;
  torn: string | null;
}

/**
 * Open critical alarms created after `afterId`, for the Teams channel post. Same selection as `listNewAlarms`
 * (so a re-run never repeats an alarm), narrowed to critical and re-checked against the minimum group size.
 * Aggregate fields only: no account ids, no answers.
 */
export function listNewCriticalAlarms(afterId: number): NewCriticalAlarm[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, s.periode, s.severity, s.n, s.confianca,
              c.nom AS collectiu, d.nom AS domini, t.nom AS torn
       FROM senyal s
       LEFT JOIN collectiu c ON c.id = s.collectiu_id
       LEFT JOIN domini d ON d.id = s.domini_id
       LEFT JOIN torn t ON t.id = s.torn_id
       WHERE s.id > ? AND s.suprimit = 0 AND s.n >= ? AND COALESCE(s.status, 'open') = 'open'
         AND s.severity = 'critical' AND COALESCE(s.audience, 'hr') IN ('hr','hr_manager')
       ORDER BY s.id`,
    )
    .all(afterId, MIN_GROUP_SIZE) as NewCriticalAlarm[];
}
