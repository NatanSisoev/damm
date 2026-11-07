import { test } from "node:test";
import assert from "node:assert/strict";
import { runEngineJob } from "../src/job.ts";
import { runInsights } from "../src/insights.ts";
import { all, type SqlDatabase } from "../src/db.ts";
import { toSqlDatetime } from "../src/time.ts";
import { addQuestion, makeDb } from "./helpers.ts";

const NOW = Date.UTC(2026, 10, 1, 0, 0, 0); // 2026-11-01, after the last period
const at = (month: number, day: number) => Date.UTC(2026, month - 1, day, 9, 0, 0);
const PERIODS = [8, 9, 10] as const;
const DAYS = [5, 15, 25] as const;

interface InsightOut {
  kind: string;
  periode: string;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number | null;
  n: number;
  value: number | null;
  detail_json: string | null;
  suprimit: number;
}
type Detail = Record<string, any>;

function answer(db: SqlDatabase, acct: string, q: number, value: number, ms: number) {
  const periode = toSqlDatetime(ms).slice(0, 7);
  db.prepare("INSERT INTO resposta (compte_id, pregunta_id, valor_num, score, periode, data) VALUES (?,?,?,?,?,?)").run(
    acct, q, value, value / 10, periode, toSqlDatetime(ms),
  );
}

/**
 * Three monthly periods (Aug–Oct 2026) with planted patterns:
 * d1 Benestar: Fàbriques falls 8 → 6 in October, Oficines stays 8.
 * d2 Lideratge: Oficines splits in October (half 2, half 10) around the same mean 6.
 * d3 Desenvolupament: Fàbriques morning 8, night 5.
 * d4 Cultura: Oficines managers 9, others 6.
 * d5 Entorn: Fàbriques drops to 2 on 5 Oct, follow-up on 8 Oct confirms for 2 of 3 people.
 * October ranking in Fàbriques: Benestar most important.
 */
function fixture(accountsPerCollective = 24) {
  const db = makeDb({ accountsPerCollective });
  const half = accountsPerCollective / 2;
  db.prepare(`UPDATE compte SET es_manager = 1 WHERE id IN (${Array.from({ length: half }, (_, i) => `'o${i}'`).join(",")})`).run();
  const q = [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 0 ? 0 : addQuestion(db, { domain: d, type: "scale10", facet: `f${d}` })));
  const fu = addQuestion(db, { domain: 5, type: "scale10", facet: "f5", followup: true });
  const rank = addQuestion(db, {
    domain: 1,
    type: "ranking",
    options: [1, 2, 3, 6].map((d) => ({ label: `d${d}`, domain_id: d })),
  });

  const accts = [
    ...Array.from({ length: accountsPerCollective }, (_, i) => ({ id: `f${i}`, c: 1, night: i % 2 === 1, mgr: false, i })),
    ...Array.from({ length: accountsPerCollective }, (_, i) => ({ id: `o${i}`, c: 2, night: false, mgr: i < half, i })),
  ];
  for (const m of PERIODS) {
    for (const day of DAYS) {
      for (const a of accts) {
        const oct = m === 10;
        const f = a.c === 1;
        const v: Record<number, number | null> = {
          1: f && oct ? 6 : 8,
          2: !f && oct ? (a.i % 2 === 0 ? 2 : 10) : f ? 7 : 6,
          3: f ? (a.night ? 5 : 8) : 7,
          4: !f ? (a.mgr ? 9 : 6) : 7,
          5: f && oct ? (day === 5 ? 2 : null) : f ? 8 : 7,
          6: 7,
        };
        for (let d = 1; d <= 6; d++) if (v[d] !== null) answer(db, a.id, q[d]!, v[d]!, at(m, day) + d * 60_000);
        if (f && oct && day === 5) answer(db, a.id, fu, a.i < (2 * accountsPerCollective) / 3 ? 2 : 8, at(10, 8));
        if (f && oct && day === 25)
          db.prepare("INSERT INTO resposta (compte_id, pregunta_id, value_json, periode, data) VALUES (?,?,?,?,?)").run(
            a.id, rank, JSON.stringify([0, 2, 1, 3]), "2026-10", toSqlDatetime(at(10, 25) + 3_600_000),
          );
      }
    }
  }
  runEngineJob(db, { now: NOW });
  const report = runInsights(db, { now: NOW });
  const rows = all<InsightOut>(db, "SELECT kind, periode, collectiu_id, torn_id, domini_id, n, value, detail_json, suprimit FROM insight");
  const find = (kind: string, periode: string, c: number | null, d: number | null, extra: (r: InsightOut) => boolean = () => true) =>
    rows.filter((r) => r.kind === kind && r.periode === periode && r.collectiu_id === c && r.domini_id === d && extra(r));
  return { db, report, rows, find };
}

const detail = (r: InsightOut | undefined): Detail => JSON.parse(r?.detail_json ?? "null");

test("insights: every kind is written, never below the minimum group size", () => {
  const { report, rows } = fixture();
  assert.equal(report.written, rows.length);
  for (const k of ["domain_state", "top_mover", "polarisation", "importance_gap", "trajectory_mix", "followup_confirmation", "segment_gap"])
    assert.ok(rows.some((r) => r.kind === k && r.suprimit === 0), `kind ${k} present`);
  for (const r of rows) {
    if (r.suprimit === 0) assert.ok(r.n >= 10, `${r.kind} visible with n=${r.n}`);
    else assert.equal(r.value ?? r.detail_json, null);
  }
  // Aggregates only: no account id ever appears in the output.
  for (const r of rows) assert.ok(!/"[fo]\d+"/.test(r.detail_json ?? ""));
});

test("domain_state: score with confidence, consensus and change vs. previous period", () => {
  const { find } = fixture();
  const aug = find("domain_state", "2026-08", 1, 1, (r) => r.torn_id === null)[0];
  assert.equal(detail(aug).previous, null);
  const oct = find("domain_state", "2026-10", 1, 1, (r) => r.torn_id === null)[0]!;
  const d = detail(oct);
  assert.equal(oct.value, d.current.score);
  assert.equal(d.previous.periode, "2026-09");
  assert.ok(d.delta < -1, `Fàbriques Benestar fell (${d.delta})`);
  assert.equal(d.labels.collective, "Fàbriques");
  assert.equal(d.labels.domain, "Benestar");
  for (const k of ["score", "confidence", "consensus", "n"]) assert.equal(typeof d.current[k], "number");
});

test("top_mover: largest confident changes, ranked", () => {
  const { rows } = fixture();
  const movers = rows.filter((r) => r.kind === "top_mover" && r.periode === "2026-10");
  assert.ok(movers.length > 0 && movers.length <= 5);
  const ds = movers.map(detail);
  assert.deepEqual(ds.map((d) => d.rank), ds.map((_, i) => i + 1));
  for (const d of ds) assert.ok(d.current.confidence >= 60 && d.previous.confidence >= 60);
  assert.equal(movers[0]!.domini_id, 1);
  assert.equal(movers[0]!.collectiu_id, 1);
  assert.equal(ds[0]!.direction, "down");
});

test("polarisation: consensus fell while the score stayed put", () => {
  const { rows, find } = fixture();
  const p = find("polarisation", "2026-10", 2, 2, (r) => r.torn_id === null)[0];
  assert.ok(p, "Oficines Lideratge polarised");
  const d = detail(p);
  assert.ok(d.consensusDrop >= 15 && Math.abs(d.scoreDelta) < 0.5);
  assert.ok(!rows.some((r) => r.kind === "polarisation" && r.domini_id === 6));
});

test("importance_gap: important and low-scoring domain comes first", () => {
  const { find } = fixture();
  const rowsF = ["1", "2", "3", "6"].map((d) => find("importance_gap", "2026-10", 1, Number(d))[0]!);
  const ben = detail(rowsF[0]);
  assert.equal(ben.rank, 1);
  assert.equal(ben.importance, 1);
  assert.equal(ben.quadrant, "act_first");
  const lowest = detail(rowsF[3]); // d6 ranked last: importance 0
  assert.equal(lowest.importance, 0);
  assert.equal(rowsF[3]!.value, 0);
});

test("trajectory_mix: only percentages of improving / stable / declining", () => {
  const { find } = fixture();
  const f = detail(find("trajectory_mix", "2026-10", 1, 1, (r) => r.torn_id === null)[0]);
  assert.equal(f.declining, 100);
  assert.equal(f.n, 24);
  const o = detail(find("trajectory_mix", "2026-10", 2, 1)[0]);
  assert.equal(o.stable, 100);
  assert.deepEqual(Object.keys(o).sort(), ["declining", "improving", "labels", "n", "stable", "windowDays"]);
  assert.ok(Math.abs(o.improving + o.stable + o.declining - 100) < 0.5);
});

test("followup_confirmation: share of follow-ups that confirmed the drop", () => {
  const { find } = fixture();
  const r = find("followup_confirmation", "2026-10", 1, 5)[0]!;
  const d = detail(r);
  assert.equal(d.resolved, 24);
  assert.equal(d.confirmed, 16);
  assert.equal(d.confirmedDown, 16);
  assert.equal(r.value, 66.7);
  assert.equal(r.n, 24);
  assert.ok(find("followup_confirmation", "2026-10", null, 5)[0], "company roll-up");
});

test("segment_gap: night vs. day shift and managers vs. non-managers", () => {
  const { find } = fixture();
  const shift = find("segment_gap", "2026-10", 1, 3, (r) => detail(r)?.dimension === "shift")[0]!;
  const s = detail(shift);
  assert.equal(shift.torn_id, 2);
  assert.equal(s.lowest.label, "nit");
  assert.ok(s.gap > 2.5 && s.gap < 3.5, `shift gap ${s.gap}`);
  const mgr = find("segment_gap", "2026-10", 2, 4, (r) => detail(r)?.dimension === "manager")[0]!;
  const m = detail(mgr);
  assert.ok(m.gap > 2.5 && m.gap < 3.5, `manager gap ${m.gap}`);
  assert.equal(m.managers.n, 12);
  assert.equal(m.others.n, 12);
});

test("suppression: segments under 10 people are written with NULL value and detail", () => {
  // 12 accounts per collective: 6 per shift, 6 managers in Oficines.
  const { rows } = fixture(12);
  const shiftRows = rows.filter((r) => r.torn_id !== null && (r.kind === "domain_state" || r.kind === "trajectory_mix"));
  assert.ok(shiftRows.length > 0);
  for (const r of shiftRows) assert.deepEqual([r.suprimit, r.value, r.detail_json, r.n], [1, null, null, 6]);
  const gaps = rows.filter((r) => r.kind === "segment_gap" && r.collectiu_id !== null);
  assert.ok(gaps.length > 0);
  for (const r of gaps) assert.equal(r.suprimit, 1);
  // Collective level (12 people) stays visible.
  assert.ok(rows.some((r) => r.kind === "domain_state" && r.collectiu_id === 1 && r.torn_id === null && r.suprimit === 0));
});

test("runInsights is idempotent", () => {
  const { db, report } = fixture();
  const again = runInsights(db, { now: NOW });
  assert.deepEqual(again, report);
  assert.equal(all(db, "SELECT 1 FROM insight").length, report.written);
});

// --- action_effect ("listen again") ---

function withAnchors(accountsPerCollective = 24) {
  const f = fixture(accountsPerCollective);
  const { db } = f;
  // Fàbriques Benestar falls from 8 to 6 in October; the new shift system starts on 30 Sep.
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, domini_id, label) VALUES ('2026-09-30', 1, 1, 'New shift system')").run();
  // Oficines Benestar is flat; HR adopts a recommendation for it on 10 Sep.
  const sig = db
    .prepare("INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, status) VALUES ('sustained_decline','x',2,1,'2026-08',24,'action_linked')")
    .run().lastInsertRowid;
  db.prepare("INSERT INTO recomanacio (senyal_id, text, estat, aprovada_el) VALUES (?, 'Publish the rota', 'aprovada', '2026-09-10 09:00:00')").run(sig);
  // Not adopted and no domain: no rows.
  db.prepare("INSERT INTO recomanacio (senyal_id, text, estat) VALUES (?, 'Proposed only', 'proposada')").run(sig);
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, label) VALUES ('2026-09-30', 1, 'No domain')").run();
  runInsights(db, { now: NOW });
  const rows = all<InsightOut>(db, "SELECT kind, periode, collectiu_id, torn_id, domini_id, n, value, detail_json, suprimit FROM insight WHERE kind = 'action_effect'");
  return { db, rows };
}

test("action_effect: score before vs after an adoption date, worded 'des de', with limits and no cause claimed", () => {
  const { rows } = withAnchors();
  assert.equal(rows.length, 2, "one per adopted recommendation and per context event with a domain");
  const ev = rows.find((r) => r.collectiu_id === 1)!;
  const d = detail(ev);
  assert.equal(d.anchor.kind, "context_event");
  assert.equal(d.since, "2026-09-30");
  assert.equal(d.change, "declined");
  assert.ok(d.before.score > d.after.score + 1.5, `${d.before.score} -> ${d.after.score}`);
  assert.equal(ev.value, d.delta);
  assert.equal(ev.periode, "2026-11");
  assert.match(d.wording, /^Des de 2026-09-30, Fàbriques · Benestar: la puntuació ha baixat/);
  assert.match(d.limits, /no que l'acció en sigui la causa/);
  const rec = detail(rows.find((r) => r.collectiu_id === 2));
  assert.equal(rec.anchor.kind, "recommendation");
  assert.equal(rec.change, "no_clear_change");
  assert.ok(Math.abs(rec.delta) < 0.3);
  assert.ok(rec.before.n >= 10 && rec.after.n >= 10);
});

test("action_effect: suppressed when either window has fewer than 10 people; replaced on every run", () => {
  const { db } = withAnchors(12);
  // Night shift only: 6 people.
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, torn_id, domini_id, label) VALUES ('2026-09-30', 1, 2, 1, 'Night only')").run();
  runInsights(db, { now: NOW });
  const rows = all<InsightOut>(db, "SELECT * FROM insight WHERE kind = 'action_effect' AND torn_id = 2");
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0]!.suprimit, rows[0]!.value, rows[0]!.detail_json], [1, null, null]);
  assert.equal(all(db, "SELECT id FROM insight WHERE kind = 'action_effect'").length, 3);
  runInsights(db, { now: NOW });
  assert.equal(all(db, "SELECT id FROM insight WHERE kind = 'action_effect'").length, 3, "idempotent");
});

test("action_effect: nothing until 14 days after the anchor", () => {
  const { db } = withAnchors();
  db.prepare("INSERT INTO context_event (event_date, collectiu_id, domini_id, label) VALUES ('2026-10-25', 1, 3, 'Too recent')").run();
  runInsights(db, { now: Date.UTC(2026, 9, 30, 9) });
  assert.equal(all(db, "SELECT id FROM insight WHERE kind = 'action_effect' AND domini_id = 3").length, 0);
});
