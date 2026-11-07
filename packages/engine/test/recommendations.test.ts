import { test } from "node:test";
import assert from "node:assert/strict";
import { runRecommendations, type DraftFn, type RecommendationContext } from "../src/recommendations.ts";
import { templateRecommendations, draftRecommendations, DAMM_INITIATIVES } from "../../ai/src/recommendations.ts";
import type { SqlDatabase } from "../src/db.ts";
import { makeDb } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 20, 9, 0, 0);
const BENESTAR = 1;
const LIDERATGE = 2;
const CONDICIONS = 6;

function alarm(db: SqlDatabase, o: { d: number; c?: number | null; t?: number | null; n?: number; suprimit?: number; status?: string; tipus?: string }): number {
  const r = db
    .prepare(
      `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, suprimit)
       VALUES (?, 'x', ?, ?, ?, '2026-10', ?, 72, 'warning', ?, 'hr', ?)`,
    )
    .run(o.tipus ?? "sustained_decline", o.c ?? 1, o.t ?? null, o.d, o.n ?? 20, o.status ?? "open", o.suprimit ?? 0);
  return Number(r.lastInsertRowid);
}

function history(db: SqlDatabase, c: number, d: number, scores: number[]) {
  scores.forEach((s, i) =>
    db
      .prepare("INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, mitjana, score, confidence, consensus, suprimit) VALUES (?,?,NULL,?,20,3,?,72,70,0)")
      .run(["2026-08", "2026-09", "2026-10"][i]!, c, d, s),
  );
}

const fake: DraftFn = (ctx) => [
  { title: `T ${ctx.domain}`, action: "Fer X", initiative: "Seguretat i salut", suggestedOwner: "Cap de torn", suggestedTimeframe: "30 dies", rationale: `n = ${ctx.n}`, limits: "correlació, no causa", source: "template" },
];

const recs = (db: SqlDatabase) => db.prepare("SELECT * FROM recomanacio ORDER BY id").all() as Record<string, any>[];

test("drafts proposals for an open alarm, linked by senyal_id, with the suggestion fields", async () => {
  const db = makeDb();
  const id = alarm(db, { d: BENESTAR });
  history(db, 1, BENESTAR, [7, 6.5, 5.5]);
  const seen: RecommendationContext[] = [];
  const r = await runRecommendations(db, { now: NOW, draft: (c) => (seen.push(c), fake(c)) });
  assert.deepEqual([r.alarms, r.proposals], [1, 1]);
  const row = recs(db)[0]!;
  assert.equal(row.senyal_id, id);
  assert.equal(row.estat, "proposada");
  assert.equal(row.titol, "T Benestar");
  assert.equal(row.responsable_suggerit, "Cap de torn");
  assert.equal(row.font, "template");
  assert.equal(seen[0]!.collective, "Fàbriques");
  assert.equal(seen[0]!.score, 5.5);
  assert.equal(seen[0]!.change, -1);
});

test("idempotent: a second run does not duplicate, even after a proposal was discarded", async () => {
  const db = makeDb();
  alarm(db, { d: BENESTAR });
  await runRecommendations(db, { now: NOW, draft: fake });
  db.prepare("UPDATE recomanacio SET estat = 'descartada'").run();
  const r = await runRecommendations(db, { now: NOW + 1000, draft: fake });
  assert.equal(r.alarms, 0);
  assert.equal(r.alreadyDrafted, 1);
  assert.equal(recs(db).length, 1);
});

test("suppressed alarms, small segments and non-open alarms get nothing", async () => {
  const db = makeDb();
  alarm(db, { d: BENESTAR, suprimit: 1 });
  alarm(db, { d: BENESTAR, n: 6 });
  alarm(db, { d: BENESTAR, status: "resolved" });
  alarm(db, { d: BENESTAR, status: "acknowledged" });
  let calls = 0;
  await runRecommendations(db, { now: NOW, draft: (c) => (calls++, fake(c)) });
  assert.equal(calls, 0);
  assert.equal(recs(db).length, 0);
});

test("Lideratge alarms never get a manager as suggested owner", async () => {
  const db = makeDb();
  alarm(db, { d: LIDERATGE });
  await runRecommendations(db, { now: NOW, draft: fake });
  assert.equal(recs(db)[0]!.responsable_suggerit, "RRHH");
});

test("a failing or empty draft is counted and does not block other alarms", async () => {
  const db = makeDb();
  alarm(db, { d: BENESTAR });
  alarm(db, { d: CONDICIONS });
  const r = await runRecommendations(db, {
    now: NOW,
    draft: (c) => {
      if (c.domain === "Benestar") throw new Error("boom");
      return fake(c);
    },
  });
  assert.deepEqual([r.alarms, r.failed], [1, 1]);
});

test("insights of the same segment reach the draft as aggregate summaries", async () => {
  const db = makeDb();
  alarm(db, { d: CONDICIONS });
  db.prepare("INSERT INTO insight (kind, periode, collectiu_id, domini_id, n, value, detail_json, suprimit) VALUES ('importance_gap','2026-10',1,?,20,1,?,0)").run(
    CONDICIONS,
    JSON.stringify({ quadrant: "act_first" }),
  );
  let ctx: RecommendationContext | undefined;
  await runRecommendations(db, { now: NOW, draft: (c) => ((ctx = c), fake(c)) });
  assert.equal(ctx!.insights[0]!.kind, "importance_gap");
  assert.equal(ctx!.insights[0]!.quadrant, "act_first");
});

const base: RecommendationContext = {
  alarmType: "sustained_decline", severity: "warning", domain: "Condicions i organització", collective: "Logística", shift: null,
  period: "2026-10", score: 5.2, change: -0.9, n: 48, confidence: 74, insights: [],
};

test("template fallback: specific, well-shaped, cites n and confidence", () => {
  const out = templateRecommendations(base);
  assert.ok(out.length >= 1 && out.length <= 3);
  assert.match(out[0]!.title + out[0]!.action, /hidrataci/i);
  for (const p of out) {
    assert.ok(p.title && p.action && p.suggestedOwner && p.suggestedTimeframe);
    assert.ok((DAMM_INITIATIVES as readonly string[]).includes(p.initiative));
    assert.match(p.rationale, /n = 48/);
    assert.match(p.rationale, /74%/);
    assert.match(p.limits, /Correlació, no causa/);
    assert.equal(p.source, "template");
  }
});

test("template covers every alarm type and domain with 1 to 3 proposals", () => {
  const types = ["sharp_drop", "sustained_decline", "changepoint_cluster", "polarisation", "feble", "low_confidence", "improvement", "baixa_participacio", "emergent"];
  const domains = ["Benestar", "Lideratge", "Desenvolupament", "Cultura i pertinença", "Entorn i relacions", "Condicions i organització"];
  for (const t of types) for (const d of domains) for (const c of ["Fàbriques", "Logística", "Comercial", "Oficines", null]) {
    const out = templateRecommendations({ ...base, alarmType: t, domain: d, collective: c });
    assert.ok(out.length >= 1 && out.length <= 3, `${t} ${d} ${c}`);
  }
});

test("draftRecommendations works with no key and falls back when the LLM fails or answers badly", async () => {
  const none = await draftRecommendations(base);
  assert.equal(none[0]!.source, "template");
  const bad = await draftRecommendations(base, { chat: async () => ({ nope: 1 }) });
  assert.equal(bad[0]!.source, "template");
  const throws = await draftRecommendations(base, { chat: async () => { throw new Error("down"); } });
  assert.equal(throws[0]!.source, "template");
  const good = await draftRecommendations(base, {
    chat: async () => ({ proposals: [{ title: "A", action: "B", initiative: "Seguretat i salut", suggestedOwner: "Prevenció", suggestedTimeframe: "1 mes" }, { title: "x", action: "y", initiative: "Invented" }] }),
  });
  assert.deepEqual(good.map((p) => [p.title, p.source]), [["A", "llm"]]);
  assert.match(good[0]!.limits, /Correlació, no causa/);
});
