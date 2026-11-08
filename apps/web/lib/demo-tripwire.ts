// DEMO ONLY, off unless DEMO_TRIPWIRE=1. A low answer on a scale question, sent from a phone, opens one clearly
// labelled demo alarm on a fixed segment and pushes it to the subscribed HR browsers, so the pitch can show
// "answer on the phone, alarm on the laptop". The alarm is staged, not derived by the engine: it never reads or
// stores who answered, the segment is fixed by env, and it only fires when that segment already has n >= MIN_GROUP_SIZE.
import { getDb } from "@damm/db";
import { maxAlarmId } from "@damm/db/hr";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { notifyNewAlarms } from "@/lib/hr-push";
import { invalidateHrMemo } from "@/lib/hr-memo";

const DEMO_PREFIX = "Demo: ";
const COOLDOWN_MS = 20_000;
let lastFired = 0;

export const tripwireEnabled = () => process.env.DEMO_TRIPWIRE === "1";

/** Low = bottom of the scale: <= 2 on scale5, <= 4 on scale10, "no" on yes_no. */
function isLow(tipus: string, value: number): boolean {
  if (tipus === "scale5") return value <= 2;
  if (tipus === "scale10") return value <= 4;
  if (tipus === "yes_no") return value === 0;
  return false;
}

/** Call after a successful submit. Never throws and never blocks the response. */
export function maybeFireDemoAlarm(answers: { preguntaId: number; valorNum?: number | null }[]): void {
  if (!tripwireEnabled() || Date.now() - lastFired < COOLDOWN_MS) return;
  void fire(answers)
    .then((r) => console.log(`[demo-tripwire] ${r}`))
    .catch((e) => console.warn("[demo-tripwire] failed:", e?.message ?? e));
}

/**
 * DEMO_LIVE_JOB fallback: when the real engine run found no new alarm, the same staged demo alarm is opened for ANY
 * answer (any question, collective or value) so the phone-to-laptop push always shows. Shorter cooldown than the tripwire.
 */
export async function fireDemoAlarmForAnyAnswer(): Promise<string> {
  if (Date.now() - lastFired < 5_000) return "skipped: fired less than 5 s ago";
  try {
    return await fire(null);
  } catch (e) {
    console.warn("[demo-tripwire] failed:", e instanceof Error ? e.message : e);
    return `failed: ${e instanceof Error ? e.message : e}`;
  }
}

async function fire(answers: { preguntaId: number; valorNum?: number | null }[] | null): Promise<string> {
  const db = getDb();
  if (answers) {
    const kind = db.prepare("SELECT tipus FROM pregunta WHERE id = ?");
    const low = answers.some((a) => {
      if (a.valorNum == null) return false;
      const row = kind.get(a.preguntaId) as { tipus: string } | undefined;
      return !!row && isLow(row.tipus, a.valorNum);
    });
    if (!low) return "skipped: answer not low";
  }

  const collective = process.env.DEMO_TRIPWIRE_COLLECTIVE || "Logística";
  const domain = process.env.DEMO_TRIPWIRE_DOMAIN || "Condicions i organització";
  const seg = db
    .prepare(
      `SELECT c.id AS c, d.id AS d, a.periode, a.n, a.confidence
       FROM agregat a JOIN collectiu c ON c.id = a.collectiu_id JOIN domini d ON d.id = a.domini_id
       WHERE c.nom = ? AND d.nom = ? AND a.torn_id IS NULL AND a.suprimit = 0 AND a.n >= ?
       ORDER BY a.periode DESC LIMIT 1`,
    )
    .get(collective, domain, MIN_GROUP_SIZE) as { c: number; d: number; periode: string; n: number; confidence: number | null } | undefined;
  if (!seg) return `skipped: no aggregate with n >= ${MIN_GROUP_SIZE} for ${collective} / ${domain} (check DEMO_TRIPWIRE_COLLECTIVE/DOMAIN and the DB)`;
  lastFired = Date.now();

  const before = maxAlarmId();
  // One live demo alarm at a time: the previous demo ones are closed, not deleted.
  db.prepare("UPDATE senyal SET status = 'dismissed' WHERE descripcio LIKE ? AND status = 'open'").run(`${DEMO_PREFIX}%`);
  db.prepare(
    `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, suprimit)
     VALUES ('sharp_drop', ?, ?, NULL, ?, ?, ?, ?, 'critical', 'open', 'hr', 0)`,
  ).run(`${DEMO_PREFIX}alarma de demostració activada des del mòbil, sobre dades agregades de ${collective} (n=${seg.n}).`, seg.c, seg.d, seg.periode, seg.n, seg.confidence);
  invalidateHrMemo();
  const push = await notifyNewAlarms(before);
  return `alarm opened for ${collective} / ${domain}, push: ${JSON.stringify(push)}`;
}
