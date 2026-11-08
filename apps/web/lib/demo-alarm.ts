// DEMO ONLY, runs only inside DEMO_LIVE_JOB. When the engine job finds no new alarm for a phone answer, a clearly
// labelled "Demo:" alarm is opened on the answerer's own collective and the answered question's domain, so the
// phone-to-laptop push always shows. To make the signal graph show a real-looking drop, the latest period's aggregate
// score of that segment is lowered in the DB (demo data only; "Restaura la demo" brings the snapshot back, and the next
// job run recomputes it from the answers). Only the collective and domain are used: no account id is stored here.
import { getDb } from "@damm/db";
import { maxAlarmId } from "@damm/db/hr";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { notifyNewAlarms } from "@/lib/hr-push";
import { invalidateHrMemo } from "@/lib/hr-memo";

const DEMO_PREFIX = "Demo: ";
const COOLDOWN_MS = 5_000;
const FAKE_DROP = 1.2; // score points (0..10) below the previous period
let lastFired = 0;

export interface DemoTarget {
  collectiuId: number;
  dominiId: number;
}

/** Collective of the account and domain of the first answered question. Read once per answer, not kept. */
export function resolveDemoTarget(compteId: string | number, preguntaIds: number[]): DemoTarget | null {
  const db = getDb();
  const c = db.prepare("SELECT collectiu_id AS c FROM compte WHERE id = ?").get(compteId) as { c: number } | undefined;
  const q = preguntaIds.length ? (db.prepare("SELECT domini_id AS d FROM pregunta WHERE id = ?").get(preguntaIds[0]) as { d: number } | undefined) : undefined;
  if (!c) return null;
  return { collectiuId: c.c, dominiId: q?.d ?? 6 };
}

export async function fireDemoAlarm(target: DemoTarget | null): Promise<string> {
  if (!target) return "skipped: unknown collective";
  if (Date.now() - lastFired < COOLDOWN_MS) return "skipped: fired less than 5 s ago";
  try {
    return await fire(target);
  } catch (e) {
    console.warn("[demo-alarm] failed:", e instanceof Error ? e.message : e);
    return `failed: ${e instanceof Error ? e.message : e}`;
  }
}

async function fire(target: DemoTarget): Promise<string> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.periode, a.n, a.score, a.confidence, c.nom AS collective
       FROM agregat a JOIN collectiu c ON c.id = a.collectiu_id
       WHERE a.collectiu_id = ? AND a.domini_id = ? AND a.torn_id IS NULL AND a.suprimit = 0 AND a.score IS NOT NULL
       ORDER BY a.periode DESC LIMIT 4`,
    )
    .all(target.collectiuId, target.dominiId) as { id: number; periode: string; n: number; score: number; confidence: number | null; collective: string }[];
  const seg = rows[0];
  if (!seg || seg.n < MIN_GROUP_SIZE) return `skipped: no aggregate with n >= ${MIN_GROUP_SIZE} for collective ${target.collectiuId} / domain ${target.dominiId}`;
  lastFired = Date.now();

  // Fake drop: make the latest period clearly lower than the one before it (mitjana is the 1..5 mean, score = (mitjana - 1) * 2.5).
  const prev = rows[1];
  if (prev && seg.score > prev.score - FAKE_DROP / 2) {
    const score = Math.max(0, +(prev.score - FAKE_DROP).toFixed(2));
    db.prepare("UPDATE agregat SET score = ?, mitjana = ? WHERE id = ?").run(score, +(score / 2.5 + 1).toFixed(3), seg.id);
    seg.score = score;
  }
  const scores = rows.map((r) => r.score.toFixed(1)).reverse();
  const trend = scores.length >= 2 ? ` Puntuació per període (${scores.join(" → ")}).` : "";

  const before = maxAlarmId();
  // One live demo alarm at a time: the previous demo ones are closed, not deleted.
  db.prepare("UPDATE senyal SET status = 'dismissed' WHERE descripcio LIKE ? AND status = 'open'").run(`${DEMO_PREFIX}%`);
  db.prepare(
    `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, suprimit)
     VALUES ('sharp_drop', ?, ?, NULL, ?, ?, ?, ?, 'critical', 'open', 'hr', 0)`,
  ).run(`${DEMO_PREFIX}alarma de demostració activada des del mòbil, sobre dades agregades de ${seg.collective} (n=${seg.n}).${trend}`, target.collectiuId, target.dominiId, seg.periode, seg.n, seg.confidence);
  invalidateHrMemo();
  const push = await notifyNewAlarms(before);
  return `alarm opened for ${seg.collective} / domain ${target.dominiId}, push: ${JSON.stringify(push)}`;
}
