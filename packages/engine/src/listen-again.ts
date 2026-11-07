// "Listen again": anchors for before/after comparisons. docs/engine.md section 6 (`action_effect`).
// An anchor is the moment HR adopted (approved) a recommendation, or a context event HR recorded
// ("new shift system from 1 Oct"). There is no "done" state: HR is not forced to act, and the engine never
// claims an action caused a change, it only reports what the scores did "since" the anchor.
import { all, type SqlDatabase } from "./db.ts";
import { dayOf, toMs } from "./time.ts";

export interface Anchor {
  kind: "recommendation" | "context_event";
  id: number;
  /** Local day, YYYY-MM-DD. */
  date: string;
  ms: number;
  collectiuId: number | null;
  tornId: number | null;
  domainId: number;
  label: string;
}

/**
 * Adopted recommendations (on the segment × domain of the alarm they answer) and context events with a domain.
 * An approved recommendation without `aprovada_el` (approved before it existed) falls back to the first day of its alarm's period.
 */
export function loadAnchors(db: SqlDatabase, timezone: string): Anchor[] {
  const out: Anchor[] = [];
  const recs = all<{ id: number; text: string; aprovada_el: string | null; periode: string; collectiu_id: number | null; torn_id: number | null; domini_id: number }>(
    db,
    `SELECT r.id, r.text, r.aprovada_el, s.periode, s.collectiu_id, s.torn_id, s.domini_id
     FROM recomanacio r JOIN senyal s ON s.id = r.senyal_id
     WHERE r.estat = 'aprovada' AND s.domini_id IS NOT NULL ORDER BY r.id`,
  );
  for (const r of recs) {
    const ms = r.aprovada_el ? toMs(r.aprovada_el) : toMs(`${r.periode}-01`);
    out.push({ kind: "recommendation", id: r.id, date: dayOf(ms, timezone), ms, collectiuId: r.collectiu_id, tornId: r.torn_id, domainId: r.domini_id, label: r.text });
  }
  const events = all<{ id: number; event_date: string; collectiu_id: number | null; torn_id: number | null; domini_id: number; label: string }>(
    db,
    "SELECT id, event_date, collectiu_id, torn_id, domini_id, label FROM context_event WHERE domini_id IS NOT NULL ORDER BY id",
  );
  for (const e of events)
    out.push({ kind: "context_event", id: e.id, date: e.event_date, ms: toMs(e.event_date), collectiuId: e.collectiu_id, tornId: e.torn_id, domainId: e.domini_id, label: e.label });
  return out;
}

/**
 * For the `improvement` alarm: per segment × domain key (`c|t|d`), the period to compare against (the last period before the one
 * containing the anchor) and the anchor date. Only anchors in a period before `current`; the latest anchor per key wins.
 */
export function improvementAnchors(anchors: Anchor[], periods: string[], current: string): Map<string, { baseline: string; since: string }> {
  const out = new Map<string, { baseline: string; since: string }>();
  for (const a of [...anchors].sort((x, y) => x.ms - y.ms || x.id - y.id)) {
    const p = a.date.slice(0, 7);
    if (p >= current) continue;
    const before = periods.filter((x) => x < p);
    const baseline = before[before.length - 1];
    if (baseline === undefined) continue;
    out.set(`${a.collectiuId}|${a.tornId}|${a.domainId}`, { baseline, since: a.date });
  }
  return out;
}
