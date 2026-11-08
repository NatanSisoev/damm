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

/** Lowers one aggregate row clearly below the previous period (mitjana is the 1..5 mean, score = (mitjana - 1) * 2.5). Idempotent. Returns the new score, or null when it was already low enough. */
function applyDrop(aggregateId: number, prevScore: number | undefined): number | null {
  if (prevScore == null) return null;
  const db = getDb();
  const row = db.prepare("SELECT score FROM agregat WHERE id = ?").get(aggregateId) as { score: number | null } | undefined;
  if (!row || row.score == null || row.score <= prevScore - FAKE_DROP / 2) return null;
  const score = Math.max(0, +(prevScore - FAKE_DROP).toFixed(2));
  db.prepare("UPDATE agregat SET score = ?, mitjana = ? WHERE id = ?").run(score, +(score / 2.5 + 1).toFixed(3), aggregateId);
  return score;
}

/**
 * Every engine job run recomputes the aggregates from the real answers, which would erase the staged drop of every
 * earlier "Demo:" alarm (the graph of an alarm HR is still working on would snap back to normal). Call this right after
 * each job run: it re-applies the drop for each segment that has a "Demo:" alarm, in the period that alarm was opened for.
 * The segments come from the alarms themselves, so nothing extra is stored and a restart loses nothing.
 */
export function reapplyDemoDrops(): number {
  const db = getDb();
  const segs = db
    .prepare("SELECT DISTINCT collectiu_id AS c, domini_id AS d, periode AS p FROM senyal WHERE descripcio LIKE ? AND collectiu_id IS NOT NULL AND domini_id IS NOT NULL")
    .all(`${DEMO_PREFIX}%`) as { c: number; d: number; p: string }[];
  let changed = 0;
  for (const s of segs) {
    const seg = db
      .prepare("SELECT id FROM agregat WHERE collectiu_id = ? AND domini_id = ? AND torn_id IS NULL AND suprimit = 0 AND score IS NOT NULL AND periode = ?")
      .get(s.c, s.d, s.p) as { id: number } | undefined;
    const prev = db
      .prepare("SELECT score FROM agregat WHERE collectiu_id = ? AND domini_id = ? AND torn_id IS NULL AND suprimit = 0 AND score IS NOT NULL AND periode < ? ORDER BY periode DESC LIMIT 1")
      .get(s.c, s.d, s.p) as { score: number } | undefined;
    if (seg && applyDrop(seg.id, prev?.score) != null) changed++;
  }
  return changed;
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

  // Fake drop: make the latest period clearly lower than the one before it.
  const dropped = applyDrop(seg.id, rows[1]?.score);
  if (dropped != null) seg.score = dropped;
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
