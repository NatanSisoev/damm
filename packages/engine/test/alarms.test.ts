import { test } from "node:test";
import assert from "node:assert/strict";
import { runAlarms } from "../src/alarms.ts";
import type { SqlDatabase } from "../src/db.ts";
import { DAY_MS, makeDb } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); // 2026-10-20
const BENESTAR = 1;
const LIDERATGE = 2;
const OFICINES = 2; // collective without shifts in the test fixture

type Pt = { score: number; conf?: number; cons?: number; n?: number };

function agg(db: SqlDatabase, periode: string, c: number | null, t: number | null, d: number, p: Pt | "suppressed") {
  if (p === "suppressed") {
    db.prepare("INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, suprimit) VALUES (?,?,?,?,?,1)").run(periode, c, t, d, 8);
    return;
  }
  db.prepare(
    "INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, mitjana, score, confidence, consensus, suprimit) VALUES (?,?,?,?,?,?,?,?,?,0)",
  ).run(periode, c, t, d, p.n ?? 40, 3, p.score, p.conf ?? 70, p.cons ?? 70);
}

/** Replaces the history of one segment × domain (all periods given, oldest first: Aug, Sep, Oct). */
function series(db: SqlDatabase, c: number | null, t: number | null, d: number, pts: (Pt | "suppressed")[]) {
  db.prepare("DELETE FROM agregat WHERE collectiu_id IS ? AND torn_id IS ? AND domini_id = ?").run(c, t, d);
  const periods = ["2026-08", "2026-09", "2026-10"].slice(-pts.length);
  pts.forEach((p, i) => agg(db, periods[i]!, c, t, d, p));
}

const alarms = (db: SqlDatabase, tipus?: string) =>
  db.prepare(`SELECT * FROM senyal ${tipus ? "WHERE tipus = ?" : ""} ORDER BY id`).all(...(tipus ? [tipus] : [])) as {
    id: number;
    tipus: string;
    severity: string;
    status: string;
    audience: string;
    n: number;
    confianca: number | null;
    descripcio: string;
    suprimit: number;
    domini_id: number;
    periode: string;
  }[];

test("sharp_drop opens a critical hr_manager alarm on a confident drop", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.2, conf: 65 }]);
  const r = runAlarms(db, { now: NOW });
  const a = alarms(db, "sharp_drop");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "critical");
  assert.equal(a[0]!.audience, "hr_manager");
  assert.equal(a[0]!.status, "open");
  assert.equal(a[0]!.periode, "2026-10");
  assert.equal(a[0]!.n, 40);
  assert.equal(r.opened, alarms(db).length);
});

test("sharp_drop needs a reliable estimate (confidence >= 30)", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0, conf: 25 }]);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "sharp_drop").length, 0);
});

test("Lideratge alarms always go to HR only", () => {
  const db = makeDb();
  series(db, OFICINES, null, LIDERATGE, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW });
  const a = alarms(db, "sharp_drop");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.domini_id, LIDERATGE);
  assert.equal(a[0]!.audience, "hr");
});

test("company-wide alarms go to HR (no manager to route to)", () => {
  const db = makeDb();
  series(db, null, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "sharp_drop")[0]!.audience, "hr");
});

test("dedup: running twice never opens two alarms for the same key", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW });
  const r2 = runAlarms(db, { now: NOW + 10 * DAY_MS });
  assert.equal(r2.opened, 0);
  assert.equal(alarms(db, "sharp_drop").length, 1);
});

test("hysteresis: stays open between the levels, resolves at the clear level", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.3 }]); // drop 1.2: trigger
  runAlarms(db, { now: NOW });
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.9 }]); // drop 0.6: between the clear (0.4) and trigger (0.7) levels
  let r = runAlarms(db, { now: NOW + DAY_MS });
  assert.equal(r.resolved, 0);
  assert.equal(alarms(db, "sharp_drop")[0]!.status, "open");
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 7.2 }]); // drop 0.3: clear
  r = runAlarms(db, { now: NOW + 2 * DAY_MS });
  assert.equal(r.resolved, 1);
  assert.equal(alarms(db, "sharp_drop")[0]!.status, "resolved");
});

test("cooldown: no reopening within 7 days of the last alarm for the key", () => {
  const db = makeDb();
  const drop = () => series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  const calm = () => series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 7.4 }]);
  drop();
  runAlarms(db, { now: NOW });
  calm();
  runAlarms(db, { now: NOW + DAY_MS });
  drop();
  assert.equal(runAlarms(db, { now: NOW + 3 * DAY_MS }).opened, 0);
  assert.equal(runAlarms(db, { now: NOW + 8 * DAY_MS }).opened, 1);
  assert.deepEqual(alarms(db, "sharp_drop").map((a) => a.status), ["resolved", "open"]);
});

test("alarms a human moved on are never auto-resolved or duplicated", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW });
  db.prepare("UPDATE senyal SET status = 'acknowledged'").run();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 7.5 }]);
  assert.equal(runAlarms(db, { now: NOW + DAY_MS }).resolved, 0);
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  assert.equal(runAlarms(db, { now: NOW + 20 * DAY_MS }).opened, 0);
  assert.deepEqual(alarms(db, "sharp_drop").map((a) => a.status), ["acknowledged"]);
});

test("sustained_decline: three falling periods open a warning", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.4 }, { score: 6.9 }, { score: 6.4 }]);
  runAlarms(db, { now: NOW });
  const a = alarms(db, "sustained_decline");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "warning");
  assert.equal(a[0]!.audience, "hr_manager");
  // Not every step down: no alarm.
  const db2 = makeDb();
  series(db2, OFICINES, null, BENESTAR, [{ score: 7.0 }, { score: 6.4 }, { score: 6.5 }]);
  runAlarms(db2, { now: NOW });
  assert.equal(alarms(db2, "sustained_decline").length, 0);
});

test("feble: small steady decline with rising confidence, info then warning if it persists", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.2, conf: 60, n: 60 }, { score: 6.9, conf: 70, n: 60 }, { score: 6.6, conf: 80, n: 60 }]);
  runAlarms(db, { now: NOW });
  let a = alarms(db, "feble");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "info");
  assert.equal(a[0]!.audience, "hr");
  runAlarms(db, { now: NOW + 5 * DAY_MS });
  assert.equal(alarms(db, "feble")[0]!.severity, "info");
  runAlarms(db, { now: NOW + 15 * DAY_MS });
  a = alarms(db, "feble");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "warning");
  // Confidence not rising: no weak signal.
  const db2 = makeDb();
  series(db2, OFICINES, null, BENESTAR, [{ score: 7.2, conf: 70, n: 60 }, { score: 6.9, conf: 70, n: 60 }, { score: 6.6, conf: 70, n: 60 }]);
  runAlarms(db2, { now: NOW });
  assert.equal(alarms(db2, "feble").length, 0);
});

test("polarisation: consensus fell >= 20 points to a split level, n >= 50", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.0, cons: 85, n: 60 }, { score: 7.0, cons: 58, n: 60 }]);
  runAlarms(db, { now: NOW });
  const a = alarms(db, "polarisation");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "warning");
  assert.equal(a[0]!.audience, "hr");
  series(db, OFICINES, null, BENESTAR, [{ score: 7.0, cons: 80, n: 60 }, { score: 7.0, cons: 75, n: 60 }]);
  assert.equal(runAlarms(db, { now: NOW + DAY_MS }).resolved, 1);
});

test("low_confidence: below 35 in two periods (or a full period of data)", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.0, conf: 30 }, { score: 7.0, conf: 30 }]);
  runAlarms(db, { now: NOW });
  const a = alarms(db, "low_confidence");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "info");
  assert.equal(a[0]!.audience, "hr");
  // Only the current period: needs most of the month in.
  const db2 = makeDb();
  series(db2, OFICINES, null, BENESTAR, [{ score: 7.0, conf: 30 }]);
  runAlarms(db2, { now: Date.UTC(2026, 9, 6, 9) });
  assert.equal(alarms(db2, "low_confidence").length, 0);
  runAlarms(db2, { now: Date.UTC(2026, 9, 16, 9) });
  assert.equal(alarms(db2, "low_confidence").length, 0);
  runAlarms(db2, { now: Date.UTC(2026, 9, 29, 9) });
  assert.equal(alarms(db2, "low_confidence").length, 1);
  // Hysteresis: 40 keeps it open, 50 clears it.
  series(db2, OFICINES, null, BENESTAR, [{ score: 7.0, conf: 40 }]);
  assert.equal(runAlarms(db2, { now: Date.UTC(2026, 9, 30, 9) }).resolved, 0);
  series(db2, OFICINES, null, BENESTAR, [{ score: 7.0, conf: 50 }]);
  assert.equal(runAlarms(db2, { now: Date.UTC(2026, 9, 31, 9) }).resolved, 1);
});

test("improvement: significant rise since an adopted recommendation or a recorded context event", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 5.0 }, { score: 5.4 }, { score: 6.0 }]);
  // Nothing adopted: nothing.
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "improvement").length, 0);
  // A status of action_linked alone is not an anchor: there is no completion state.
  const sig = db
    .prepare(
      "INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, status, created_at) VALUES ('sharp_drop','x',?,NULL,?,'2026-08',20,'action_linked','2026-08-20 09:00:00')",
    )
    .run(OFICINES, BENESTAR).lastInsertRowid;
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "improvement").length, 0);
  // Adopting (approving) a recommendation on 10 Sep anchors it; the baseline is the period before (Aug).
  db.prepare("INSERT INTO recomanacio (senyal_id, text, estat, aprovada_el) VALUES (?, 'r', 'aprovada', '2026-09-10 09:00:00')").run(sig);
  runAlarms(db, { now: NOW });
  const a = alarms(db, "improvement");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.severity, "info");
  assert.equal(a[0]!.audience, "hr_manager");
  assert.match(a[0]!.descripcio, /since 2026-09-10/);
  assert.match(a[0]!.descripcio, /does not show the action caused it/);
  // The linked alarm itself is never touched.
  assert.equal(alarms(db, "sharp_drop")[0]!.status, "action_linked");
});

test("improvement: a context event with a domain is an anchor too; a domainless one is not", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 5.0 }, { score: 5.4 }, { score: 6.0 }]);
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, label) VALUES ('2026-09-05', ?, 'Reorganisation')").run(OFICINES);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "improvement").length, 0);
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, domini_id, label) VALUES ('2026-09-05', ?, ?, 'New rota')").run(OFICINES, BENESTAR);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "improvement").length, 1);
});

function confirmDrops(db: SqlDatabase, accounts: string[], d: number, day: string) {
  const st = db.prepare(
    "INSERT INTO person_domain_state (compte_id, domini_id, level, variance, n, last_at, confirmed_change_at, confirmed_change_dir) VALUES (?,?,0.4,0.01,5,?,?,-1)",
  );
  for (const a of accounts) st.run(a, d, `${day} 09:00:00`, day);
}

test("changepoint_cluster: >= 10 confirmed drops in the segment within 14 days, count only", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.0 }, { score: 7.0 }]);
  confirmDrops(db, ["o0", "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"], BENESTAR, "2026-10-15");
  confirmDrops(db, ["o9"], BENESTAR, "2026-09-01"); // outside the window
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "changepoint_cluster").length, 0);
  db.prepare("UPDATE person_domain_state SET confirmed_change_at = '2026-10-12' WHERE compte_id = 'o9'").run();
  runAlarms(db, { now: NOW });
  const a = alarms(db, "changepoint_cluster");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.n, 10);
  assert.equal(a[0]!.severity, "critical");
  assert.equal(a[0]!.audience, "hr_manager");
  assert.equal(a[0]!.confianca, null);
});

test("changepoint_cluster is not emitted on nesting segments (no differencing of shift counts)", () => {
  const db = makeDb();
  // Fàbriques has shifts: 6 drops per shift, 12 for the collective. Only shift segments are evaluated.
  series(db, 1, null, BENESTAR, [{ score: 7.0 }]);
  series(db, 1, 1, BENESTAR, [{ score: 7.0 }]);
  series(db, 1, 2, BENESTAR, [{ score: 7.0 }]);
  confirmDrops(db, Array.from({ length: 12 }, (_, i) => `f${i}`), BENESTAR, "2026-10-15");
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "changepoint_cluster").length, 0);
});

test("suppression: nothing opens on n < 10, open alarms are hidden when their segment drops below 10", () => {
  const db = makeDb();
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0, n: 9 }]);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db).length, 0);

  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW });
  assert.equal(alarms(db, "sharp_drop").length, 1);
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, "suppressed"]);
  const r = runAlarms(db, { now: NOW + DAY_MS });
  assert.equal(r.suppressed, 1);
  const a = alarms(db, "sharp_drop")[0]!;
  assert.equal(a.suprimit, 1);
  assert.equal(a.status, "open");
  assert.equal(a.confianca, null);
  // n back to >= 10: visible again.
  series(db, OFICINES, null, BENESTAR, [{ score: 7.5 }, { score: 6.0 }]);
  runAlarms(db, { now: NOW + 2 * DAY_MS });
  assert.equal(alarms(db, "sharp_drop")[0]!.suprimit, 0);
});

test("no aggregates: nothing happens", () => {
  const db = makeDb();
  assert.deepEqual(runAlarms(db, { now: NOW }), { opened: 0, resolved: 0, suppressed: 0 });
});

// ---- Noise must not alarm; planted signals must. Pure evaluators, default thresholds. ----------------------------

import {
  ALARM_DEFAULTS as T,
  evalChangepointCluster,
  evalImprovement,
  evalLowConfidence,
  evalPolarisation,
  evalSharpDrop,
  evalSustainedDecline,
  evalWeakSignal,
  isBroad,
  zOfDifference,
} from "../src/alarms.ts";

const P = (score: number, n = 60, confidence = 70, consensus = 70) => ({ score, n, confidence, consensus });

test("noise: a small drop in a small group does not alarm", () => {
  assert.equal(evalSharpDrop([P(7.2, 12), P(6.4, 12)], T).trigger, false, "n=12 is below the change gate");
  assert.equal(evalSharpDrop([P(7.2, 29), P(6.0, 29)], T).trigger, false, "n=29 is just below the gate");
});

test("noise: a modest drop (0.5) with a decent n does not alarm", () => {
  assert.equal(evalSharpDrop([P(7.0, 40), P(6.5, 40)], T).trigger, false);
});

test("noise: a drop that one or two people could cause is not broad", () => {
  // 0.7 points in 40 people is 28 person-points; breadth needs >= 30. Two people moving 7 points each would be 14.
  assert.equal(isBroad(0.7, 40, T), false);
  assert.equal(isBroad(0.7, 60, T), true);
  assert.equal(evalSharpDrop([P(7.0, 40), P(6.3, 40)], T).trigger, false);
});

test("noise: a large drop on a low-confidence estimate does not alarm", () => {
  assert.equal(evalSharpDrop([P(7.5, 60, 70), P(6.2, 60, 25)], T).trigger, false);
});

test("noise: sustained decline needs total >= 0.6 and significance", () => {
  assert.equal(evalSustainedDecline([P(7.0), P(6.8), P(6.6)], T).trigger, false, "total 0.4");
  assert.equal(evalSustainedDecline([P(7.0, 40, 30), P(6.7, 40, 30), P(6.4, 40, 30)], T).trigger, false, "total 0.6 but z too low at confidence 30");
});

test("noise: a 10 of 100 changepoint cluster is under the share gate", () => {
  assert.equal(evalChangepointCluster(10, 14, T, 10, 100).trigger, false);
  assert.equal(evalChangepointCluster(5, 14, T, 10, 30).trigger, false, "5 people is below the absolute count");
});

test("noise: polarisation at small n or with a small fall does not alarm", () => {
  assert.equal(evalPolarisation([P(7, 30, 70, 70), P(7, 30, 70, 40)], T).trigger, false, "n=30 < 50");
  assert.equal(evalPolarisation([P(7, 80, 70, 70), P(7, 80, 70, 55)], T).trigger, false, "fall 15 < 20");
});

test("noise: low confidence on a small group, or in a first period, does not alarm", () => {
  assert.equal(evalLowConfidence([P(7, 20, 20)], 40, T).trigger, false, "n=20");
  assert.equal(evalLowConfidence([P(7, 60, 20)], 5, T).trigger, false, "first look, 5 days in");
});

test("noise: an improvement that is small or not significant does not alarm", () => {
  assert.equal(evalImprovement(P(6.0), P(6.4), T).trigger, false);
  assert.equal(evalImprovement(P(6.0, 40, 30), P(6.6, 40, 30), T).trigger, false);
});

test("planted: a large, broad, significant drop is critical", () => {
  const e = evalSharpDrop([P(7.5, 80, 75), P(6.2, 80, 75)], T);
  assert.equal(e.trigger, true);
  assert.equal(e.severity, "critical");
  assert.ok(zOfDifference(P(7.5, 80, 75), P(6.2, 80, 75)) >= T.zCritical);
});

test("planted: a drop of 0.8 with z in the warning band is a warning, not critical", () => {
  const e = evalSharpDrop([P(7.0, 60, 60), P(6.2, 60, 60)], T);
  assert.equal(e.trigger, true);
  assert.equal(e.severity, "warning");
});

test("planted: a steady, significant three-period slide is critical when large", () => {
  const e = evalSustainedDecline([P(7.6, 80, 75), P(6.8, 80, 75), P(6.1, 80, 75)], T);
  assert.equal(e.trigger, true);
  assert.equal(e.severity, "critical");
});

test("planted: a weak signal (small steady fall, confidence rising) still alarms at n=60", () => {
  const e = evalWeakSignal([P(7.0, 60, 55), P(6.7, 60, 65), P(6.4, 60, 75)], T);
  assert.equal(e.trigger, true);
});

test("planted: a changepoint cluster of 30% of a segment is critical", () => {
  const e = evalChangepointCluster(24, 14, T, 10, 80);
  assert.equal(e.trigger, true);
  assert.equal(e.severity, "critical");
});

test("planted: polarisation with a real fall at n>=50 alarms", () => {
  assert.equal(evalPolarisation([P(7, 80, 70, 75), P(7, 80, 70, 45)], T).trigger, true);
});

test("ALARM_MIN_CONFIDENCE is the one tunable gate on score confidence", () => {
  assert.equal(T.changeMinConfidence, 50);
  const hist = [P(7.5, 80, 45), P(6.2, 80, 45)];
  assert.equal(evalSharpDrop(hist, T).trigger, false, "confidence 45 is under the default 50");
  assert.equal(evalSharpDrop(hist, { ...T, changeMinConfidence: 40 }).trigger, true, "looser setting lets it through");
  assert.equal(evalSharpDrop([P(7.5, 80, 75), P(6.2, 80, 75)], { ...T, changeMinConfidence: 80 }).trigger, false, "stricter setting blocks it");
});
