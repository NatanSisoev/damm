import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { runEngineJob, startEngineScheduler } from "../src/job.ts";
import { alarmCounts, AlarmTransitionError, listAlarms, listInsights, setAlarmStatus } from "../src/hr.ts";
import { all, run, type SqlDatabase } from "../src/db.ts";
import { addPool, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

function seeded(): { db: SqlDatabase; now: number } {
  const db = makeDb({ accountsPerCollective: 12 });
  addPool(db);
  let now = T0;
  const engine = createEngine({ db, redact: identity, now: () => now });
  const accounts = all<{ id: string }>(db, "SELECT id FROM compte").map((r) => r.id);
  for (let d = 0; d < 10; d++) {
    for (const a of accounts)
      engine.submitAnswers(a, engine.getDailyBatch(a).items.map((it) => ({ preguntaId: it.questionId, valorNum: it.type === "yes_no" ? 1 : 7 })));
    now += DAY_MS;
  }
  runEngineJob(db, { now });
  return { db, now };
}

const addAlarm = (db: SqlDatabase, a: { type?: string; c: number | null; d: number; severity: string; audience: string; status?: string; suprimit?: number; at?: string }) =>
  Number(
    run(
      db,
      `INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, severity, status, audience, created_at, suprimit)
       VALUES (?, 'test alarm', ?, ?, '2026-10', 20, ?, ?, ?, ?, ?)`,
      a.type ?? "sharp_drop",
      a.c,
      a.d,
      a.severity,
      a.status ?? "open",
      a.audience,
      a.at ?? "2026-10-10 10:00:00",
      a.suprimit ?? 0,
    ).lastInsertRowid,
  );

test("listInsights: latest period by default, typed detail, no suppressed rows unless asked", () => {
  const { db } = seeded();
  const rows = listInsights(db, { role: "hr" });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.periode === rows[0]!.periode && !r.suppressed && r.detail !== null));
  const ds = rows.find((r) => r.kind === "domain_state");
  assert.ok(ds && ds.kind === "domain_state" && typeof ds.detail!.current.score === "number" && ds.detail!.labels.collective);
  const withSup = listInsights(db, { role: "hr" }, { includeSuppressed: true });
  assert.ok(withSup.length >= rows.length);
  assert.ok(withSup.filter((r) => r.suppressed).every((r) => r.value === null && r.detail === null));
  assert.ok(listInsights(db, { role: "hr" }, { collectiuId: null }).every((r) => r.collectiuId === null));
  assert.ok(listInsights(db, { role: "hr" }, { kind: ["domain_state"] }).every((r) => r.kind === "domain_state"));
});

test("listInsights: a manager only sees their own collective", () => {
  const { db } = seeded();
  const mine = listInsights(db, { role: "manager", collectiuId: 2 }, { collectiuId: 1 });
  assert.ok(mine.length > 0 && mine.every((r) => r.collectiuId === 2));
});

test("listAlarms: viewer filtering, suppression, ordering and counts", () => {
  const db = makeDb();
  const crit = addAlarm(db, { c: 1, d: 6, severity: "critical", audience: "hr_manager", at: "2026-10-01 10:00:00" });
  const warn = addAlarm(db, { c: 1, d: 3, severity: "warning", audience: "hr_manager", at: "2026-10-12 10:00:00" });
  const lead = addAlarm(db, { c: 1, d: 2, severity: "critical", audience: "hr" });
  addAlarm(db, { c: 2, d: 6, severity: "warning", audience: "hr_manager" });
  addAlarm(db, { c: 1, d: 5, severity: "critical", audience: "hr_manager", suprimit: 1 });
  addAlarm(db, { c: 1, d: 4, severity: "info", audience: "hr_manager", status: "resolved" });

  const hr = listAlarms(db, { role: "hr" });
  assert.equal(hr.length, 4);
  assert.equal(hr[0]!.severity, "critical");
  assert.ok(hr.every((a) => a.status !== "resolved"));
  const mgr = listAlarms(db, { role: "manager", collectiuId: 1 });
  assert.deepEqual(mgr.map((a) => a.id).sort(), [crit, warn].sort());
  assert.ok(!mgr.some((a) => a.id === lead), "Lideratge (audience hr) is hidden from the manager");
  assert.deepEqual(alarmCounts(db, { role: "manager", collectiuId: 1 }), { critical: 1, warning: 1, info: 0 });
  assert.equal(listAlarms(db, { role: "hr" }, { status: "resolved" }).length, 1);
});

test("setAlarmStatus: only allowed human transitions", () => {
  const db = makeDb();
  const id = addAlarm(db, { c: 1, d: 6, severity: "critical", audience: "hr_manager" });
  assert.equal(setAlarmStatus(db, id, "acknowledged").status, "acknowledged");
  assert.throws(() => setAlarmStatus(db, id, "open"), AlarmTransitionError);
  assert.equal(setAlarmStatus(db, id, "action_linked").status, "action_linked");
  assert.equal(setAlarmStatus(db, id, "resolved").status, "resolved");
  assert.throws(() => setAlarmStatus(db, id, "acknowledged"), AlarmTransitionError);
  assert.throws(() => setAlarmStatus(db, 999, "resolved"), AlarmTransitionError);
});

test("scheduler: runs on start, runNow works, errors do not throw, stop clears the timer", () => {
  const { db, now } = seeded();
  const reports: unknown[] = [];
  const s = startEngineScheduler(db, { intervalMs: 60_000, now: () => now, onReport: (r) => reports.push(r) });
  assert.equal(reports.length, 1);
  assert.ok(s.lastReport() && s.lastRunAt() === now);
  assert.ok(s.runNow());
  assert.equal(reports.length, 2);
  s.stop();

  const errors: unknown[] = [];
  const broken = { prepare: () => { throw new Error("db down"); }, exec: () => undefined } as unknown as SqlDatabase;
  const s2 = startEngineScheduler(broken, { intervalMs: 60_000, onError: (e) => errors.push(e) });
  assert.equal(errors.length, 1);
  assert.equal(s2.lastReport(), null);
  s2.stop();
  assert.throws(() => startEngineScheduler(db, { intervalMs: 10 }));
});
