// Data retention purge (R-PRIV-8). Job code: never call from a request path of the HR dashboard.
// Deletes raw rows past the window and keeps every aggregate table (agregat, tema, senyal, insight, recomanacio...).
import type { Db } from "./connection";
import { RETENTION } from "@damm/shared";

export interface PurgeCounts {
  cutoffPeriod: string; // 'YYYY-MM': responses with periode < this are purged
  responses: number;
  commentThemeLinks: number;
  seedLabels: number;
  inactiveAccounts: number;
  stalePushSubscriptions: number;
}

export interface PurgeOptions {
  now?: Date;
  dryRun?: boolean;
  rawResponseMonths?: number;
  inactiveAccountMonths?: number;
  pushSubscriptionMonths?: number;
}

function monthsBack(now: Date, months: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return d.toISOString().slice(0, 7);
}

export function purgeExpired(db: Db, opts: PurgeOptions = {}): PurgeCounts {
  const now = opts.now ?? new Date();
  const cutoff = monthsBack(now, opts.rawResponseMonths ?? RETENTION.rawResponseMonths);
  const inactiveCutoff = monthsBack(now, opts.inactiveAccountMonths ?? RETENTION.inactiveAccountMonths);
  const pushCutoff = monthsBack(now, opts.pushSubscriptionMonths ?? RETENTION.pushSubscriptionMonths);
  // Compare datetime strings against the first day of the cutoff month.
  const inactiveDate = `${inactiveCutoff}-01`;
  const pushDate = `${pushCutoff}-01`;

  // Accounts to drop: created before the cutoff and with no response at or after it. Computed after the response purge
  // would run, so an account whose only answers just expired counts as inactive as well.
  const inactiveSql = `
    SELECT c.id FROM compte c
    WHERE c.creat < ?
      AND NOT EXISTS (SELECT 1 FROM resposta r WHERE r.compte_id = c.id AND r.periode >= ? AND r.periode >= ?)`;

  const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
  const counts: PurgeCounts = {
    cutoffPeriod: cutoff,
    responses: count("SELECT COUNT(*) n FROM resposta WHERE periode < ?", cutoff),
    commentThemeLinks: count("SELECT COUNT(*) n FROM comentari_tema WHERE resposta_id IN (SELECT id FROM resposta WHERE periode < ?)", cutoff),
    seedLabels: count("SELECT COUNT(*) n FROM resposta_seed WHERE resposta_id IN (SELECT id FROM resposta WHERE periode < ?)", cutoff),
    inactiveAccounts: count(`SELECT COUNT(*) n FROM (${inactiveSql})`, inactiveDate, inactiveCutoff, cutoff),
    stalePushSubscriptions: count("SELECT COUNT(*) n FROM push_subscripcio WHERE creat < ?", pushDate),
  };
  if (opts.dryRun) return counts;

  db.transaction(() => {
    db.prepare("DELETE FROM comentari_tema WHERE resposta_id IN (SELECT id FROM resposta WHERE periode < ?)").run(cutoff);
    db.prepare("DELETE FROM resposta_seed WHERE resposta_id IN (SELECT id FROM resposta WHERE periode < ?)").run(cutoff);
    db.prepare("DELETE FROM resposta WHERE periode < ?").run(cutoff);
    db.prepare("DELETE FROM push_subscripcio WHERE creat < ?").run(pushDate);
    // Remaining FKs (assignment, person_domain_state, push_subscripcio) cascade; responses of these accounts are already gone.
    db.prepare(`DELETE FROM compte WHERE id IN (${inactiveSql})`).run(inactiveDate, inactiveCutoff, cutoff);
  })();
  return counts;
}
