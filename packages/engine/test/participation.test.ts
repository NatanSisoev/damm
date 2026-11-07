import { test } from "node:test";
import assert from "node:assert/strict";
import { evalLowParticipation, ALARM_DEFAULTS, runAlarms } from "../src/alarms.ts";
import type { SqlDatabase } from "../src/db.ts";
import { DAY_MS, makeDb } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); // 2026-10-20
const MATI = 1;
const NIT = 2;

/** Fàbriques population: 30 morning + 40 night. Oficines: 30 (no shifts). 20 respondents max per shift. */
function setup(nit: number, mati = 20, oficines = 20) {
  const db = makeDb({ accountsPerCollective: 40 });
  const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (1, 1, ?)");
  for (let i = 0; i < 10; i++) emp.run(MATI);
  for (let i = 0; i < 20; i++) emp.run(NIT);
  db.prepare("INSERT INTO pregunta (id, domini_id, text, tipus, estat) VALUES (1, 1, 'q', 'scale10', 'aprovada')").run();
  // The alarm run needs at least one period in `agregat`.
  db.prepare("INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, suprimit) VALUES ('2026-10', 1, NULL, 1, 5, 1)").run();
  respond(db, "f", MATI, mati);
  respond(db, "f", NIT, nit);
  respond(db, "o", null, oficines);
  return db;
}

/** Makes exactly `k` accounts of a shift (f{even}=mati, f{odd}=nit; o{i}=Oficines) have answered in 2026-10. */
function respond(db: SqlDatabase, prefix: "f" | "o", torn: number | null, k: number) {
  const ids = (db.prepare("SELECT id FROM compte WHERE id LIKE ? AND torn_id IS ? ORDER BY id").all(`${prefix}%`, torn) as { id: string }[]).map((r) => r.id);
  db.prepare(`DELETE FROM resposta WHERE compte_id IN (${ids.map(() => "?").join(",") || "NULL"})`).run(...ids);
  for (const id of ids.slice(0, k)) db.prepare("INSERT INTO resposta (compte_id, pregunta_id, valor_num, periode) VALUES (?, 1, 5, '2026-10')").run(id);
}

const low = (db: SqlDatabase) =>
  db.prepare("SELECT * FROM senyal WHERE tipus = 'baixa_participacio' ORDER BY id").all() as {
    id: number; collectiu_id: number; torn_id: number | null; domini_id: number | null; severity: string; audience: string;
    status: string; n: number; suprimit: number; descripcio: string; confianca: number | null;
  }[];

test("baixa_participacio opens a warning for the under-sampled night shift only", () => {
  const db = setup(12); // night 12 of 40 = 30%; morning 20 of 30; Oficines 20 of 30
  const r = runAlarms(db, { now: NOW });
  const a = low(db);
  assert.equal(r.opened, 1);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.collectiu_id, 1);
  assert.equal(a[0]!.torn_id, NIT);
  assert.equal(a[0]!.domini_id, null);
  assert.equal(a[0]!.severity, "warning");
  assert.equal(a[0]!.audience, "hr");
  assert.equal(a[0]!.status, "open");
  assert.equal(a[0]!.n, 12);
  assert.match(a[0]!.descripcio, /^Participació baixa al torn de nit de Fàbriques: 30% \(n=12 de 40\)/);
});

test("baixa_participacio also triggers on the share gap alone, and never on a nesting segment", () => {
  // Night 17/40 = 42.5% (above the 40% rate trigger) but 17/57 of respondents vs 40/100 of the population.
  const db = setup(17, 20, 20);
  runAlarms(db, { now: NOW });
  assert.equal(low(db).length, 0, "ratio 0.75 and rate 42.5% are between trigger and clear: nothing opens");
  respond(db, "f", NIT, 14); // 14/54 = 26% share vs 40%: ratio 0.65 < 0.7, rate 35%
  runAlarms(db, { now: NOW + DAY_MS });
  const a = low(db);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.torn_id, NIT);
  assert.ok(a.every((x) => x.torn_id !== null), "Fàbriques has shifts: no collective-level alarm that could be differenced");
});

test("hysteresis: stays open between trigger and clear, resolves at the clear level", () => {
  const db = setup(12);
  runAlarms(db, { now: NOW });
  respond(db, "f", NIT, 17); // 42.5%, ratio 0.75: between levels
  runAlarms(db, { now: NOW + DAY_MS });
  assert.deepEqual(low(db).map((a) => a.status), ["open"]);
  respond(db, "f", NIT, 20); // 50%, share 20/60 vs 40%: ratio 0.83
  const r = runAlarms(db, { now: NOW + 2 * DAY_MS });
  assert.equal(r.resolved, 1);
  assert.deepEqual(low(db).map((a) => a.status), ["resolved"]);
});

test("a segment with fewer than 10 respondents is suppressed, not reported", () => {
  const db = setup(6);
  assert.equal(runAlarms(db, { now: NOW }).opened, 0);
  assert.equal(low(db).length, 0);
  // An open alarm is hidden once the count falls under the minimum group size.
  respond(db, "f", NIT, 12);
  runAlarms(db, { now: NOW + DAY_MS });
  assert.equal(low(db)[0]!.suprimit, 0);
  respond(db, "f", NIT, 6);
  const r = runAlarms(db, { now: NOW + 2 * DAY_MS });
  assert.equal(r.suppressed, 1);
  assert.equal(low(db)[0]!.suprimit, 1);
});

test("a segment with a population under 10 is suppressed", () => {
  const db = makeDb();
  db.exec("DELETE FROM empleat_sintetic WHERE torn_id = 2 AND rowid > 6");
  db.prepare("INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, suprimit) VALUES ('2026-10', 1, NULL, 1, 5, 1)").run();
  assert.equal(runAlarms(db, { now: NOW }).opened, 0);
  assert.equal(low(db).length, 0);
});

test("cooldown: no reopening within 7 days of the last alarm", () => {
  const db = setup(12);
  runAlarms(db, { now: NOW });
  respond(db, "f", NIT, 20);
  runAlarms(db, { now: NOW + DAY_MS }); // resolved
  respond(db, "f", NIT, 12);
  assert.equal(runAlarms(db, { now: NOW + 3 * DAY_MS }).opened, 0);
  assert.equal(runAlarms(db, { now: NOW + 8 * DAY_MS }).opened, 1);
  assert.deepEqual(low(db).map((a) => a.status), ["resolved", "open"]);
});

test("evalLowParticipation: pure levels and thresholds", () => {
  const c = { respondents: 18, population: 82, totalRespondents: 100, totalPopulation: 200 };
  const e = evalLowParticipation(c, "al torn de nit de Fàbriques", ALARM_DEFAULTS, 10);
  assert.equal(e.trigger, true);
  assert.equal(e.clear, false);
  assert.match(e.description, /^Participació baixa al torn de nit de Fàbriques: 22% \(n=18 de 82\)/);
  const ok = evalLowParticipation({ ...c, respondents: 60, totalRespondents: 150 }, "x", ALARM_DEFAULTS, 10);
  assert.equal(ok.trigger, false);
  assert.equal(ok.clear, true);
  assert.equal(evalLowParticipation({ ...c, respondents: 9 }, "x", ALARM_DEFAULTS, 10).suppressed, true);
});
