import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { listInsights } from "../src/hr.ts";
import { all, one, run, type SqlDatabase } from "../src/db.ts";
import { createComplete, llmConfigFromEnv, type Complete, type CompleteRequest } from "../src/llm.ts";
import { extractJson, MAX_COMMENTS, runNarrative, validateNarrative } from "../src/narrative.ts";
import { addPool, DAY_MS, identity, makeDb, T0 } from "./helpers.ts";

function seeded(accountsPerCollective = 12): { db: SqlDatabase; now: number } {
  const db = makeDb({ accountsPerCollective });
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

/** Gives the first n answers a distinct comment text. */
function addComments(db: SqlDatabase, n: number, tag = "c"): void {
  const ids = all<{ id: number }>(db, "SELECT id FROM resposta ORDER BY id LIMIT ?", n).map((r) => r.id);
  ids.forEach((id, i) => run(db, "UPDATE resposta SET comentari = ? WHERE id = ?", `${tag} comment ${i} about the shift system`, id));
}

function fake(overrides: { reply?: (n: number) => string } = {}): { complete: Complete; calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  const complete: Complete = async (req) => {
    calls.push(req);
    if (overrides.reply) return overrides.reply(calls.length);
    return JSON.stringify({
      summary: `Summary ${calls.length}. Scores are stable.`,
      highlights: [{ text: "Benestar is steady", domain: "benestar", evidence: "score 7 with high confidence" }],
      suggestedActions: [{ title: `Review workload ${calls.length}`, why: "Because of the scores.", domain: "Benestar", followUpSurvey: "Ask about workload", alarmId: null }],
    });
  };
  return { complete, calls };
}

const rowsOf = (db: SqlDatabase) => all<{ id: number; collectiu_id: number | null; detail_json: string }>(db, "SELECT id, collectiu_id, detail_json FROM insight WHERE kind = 'narrative' ORDER BY id");

test("input has no account ids, no small segments, and caps and filters comments", async () => {
  const { db, now } = seeded();
  addComments(db, 100);
  // Domain 3 becomes suppressed: its comments must not be sent.
  run(db, "UPDATE agregat SET suprimit = 1, mitjana = NULL, score = NULL, confidence = NULL, consensus = NULL WHERE domini_id = 3");
  const { complete, calls } = fake();
  await runNarrative(db, { now, complete });
  assert.equal(calls.length, 3); // All + 2 collectives
  const domain3 = one<{ nom: string }>(db, "SELECT nom FROM domini WHERE id = 3")!.nom;
  for (const c of calls) {
    assert.ok(!/\b[fo]\d{1,2}\b/.test(c.user), "no account ids");
    assert.ok(!c.user.includes(`"${domain3}"`), "suppressed domain not in the data");
    assert.ok(!c.user.includes(`[${domain3}]`), "comments of a suppressed domain are not sent");
    const sent = c.user.split("\n").filter((l) => /^\d+\. \[/.test(l));
    assert.ok(sent.length <= MAX_COMMENTS && sent.length > 0);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(sent.join("\n")), "no dates with comments");
    for (const m of c.user.matchAll(/"n": (\d+)/g)) assert.ok(Number(m[1]) >= 10);
  }
  assert.ok(calls.some((c) => c.user.split("\n").filter((l) => /^\d+\. \[/.test(l)).length === MAX_COMMENTS), "cap reached with 100 comments");
});

test("segments under the minimum group size get no call and no row", async () => {
  const { db, now } = seeded(6); // 6 accounts per collective, 12 company-wide
  const { complete, calls } = fake();
  const rep = await runNarrative(db, { now, complete });
  assert.equal(calls.length, 1);
  assert.deepEqual(rep.segments.map((s) => s.status), ["written", "too_small", "too_small"]);
  assert.equal(rowsOf(db).length, 1);
  assert.equal(rowsOf(db)[0]!.collectiu_id, null);
});

test("malformed output is retried once then dropped; partial output keeps the valid parts", async () => {
  const { db, now } = seeded();
  const bad = fake({ reply: () => "I cannot do that" });
  const rep = await runNarrative(db, { now, complete: bad.complete });
  assert.ok(rep.segments.every((s) => s.status === "failed"));
  assert.equal(bad.calls.length, 6); // 2 attempts per segment
  assert.equal(rowsOf(db).length, 0);

  const partial = fake({
    reply: () =>
      "Sure!\n```json\n" +
      JSON.stringify({
        summary: "Only a summary survives.",
        highlights: [{ text: "no evidence" }, "junk", { text: "ok", evidence: ["a", "b"], domain: "Nonexistent" }],
        suggestedActions: [{ title: "no why" }, { title: "Fix it", why: "because", alarmId: 999999 }],
      }) +
      "\n```",
  });
  await runNarrative(db, { now, complete: partial.complete });
  const d = JSON.parse(rowsOf(db)[0]!.detail_json);
  assert.equal(d.summary, "Only a summary survives.");
  assert.equal(d.highlights.length, 1);
  assert.equal(d.highlights[0].domain, null);
  assert.equal(d.highlights[0].evidence, "a; b");
  assert.equal(d.suggestedActions.length, 1);
  assert.equal(d.suggestedActions[0].alarmId, null);

  const thrower: Complete = async () => {
    throw new Error("boom");
  };
  const rep2 = await runNarrative(db, { now, complete: thrower, periode: "2026-10" });
  assert.ok(rep2.segments.every((s) => s.status === "unchanged" || s.status === "failed"));
});

test("extractJson and validateNarrative", () => {
  assert.deepEqual(extractJson('noise {"a": "}{"} tail {"b":1}'), { a: "}{" });
  assert.equal(extractJson("no json"), null);
  assert.equal(validateNarrative({ summary: "  " }, [], new Map()), null);
  assert.equal(validateNarrative([], [], new Map()), null);
});

test("unchanged input is skipped; changed input replaces the rows without duplicates", async () => {
  const { db, now } = seeded();
  addComments(db, 20);
  const first = fake();
  await runNarrative(db, { now, complete: first.complete });
  assert.equal(first.calls.length, 3);
  const before = rowsOf(db);
  assert.equal(before.length, 3);
  const recs = all(db, "SELECT id FROM recomanacio").length;
  assert.equal(recs, 3);

  const second = fake();
  const rep = await runNarrative(db, { now: now + 1000, complete: second.complete });
  assert.equal(second.calls.length, 0);
  assert.ok(rep.segments.every((s) => s.status === "unchanged"));
  assert.deepEqual(rowsOf(db), before);

  addComments(db, 20, "new");
  const third = fake();
  await runNarrative(db, { now: now + 2000, complete: third.complete });
  assert.ok(third.calls.length >= 1);
  assert.equal(rowsOf(db).length, 3);
  assert.equal(all(db, "SELECT id FROM recomanacio WHERE estat = 'proposada'").length, 3); // old proposals replaced, not piled up
});

test("approved and discarded recommendations are never touched or re-proposed", async () => {
  const { db, now } = seeded();
  addComments(db, 20);
  await runNarrative(db, { now, complete: fake().complete });
  const recs = all<{ id: number }>(db, "SELECT id FROM recomanacio ORDER BY id");
  run(db, "UPDATE recomanacio SET estat = 'aprovada' WHERE id = ?", recs[0]!.id);
  run(db, "UPDATE recomanacio SET estat = 'descartada' WHERE id = ?", recs[1]!.id);
  const decidedText = one<{ text: string }>(db, "SELECT text FROM recomanacio WHERE id = ?", recs[0]!.id)!.text;

  addComments(db, 20, "other");
  // Same title as the approved one for the segment that produced it: must not come back as a new proposal.
  const title = decidedText.split(". ")[0]!;
  const rerun = fake({
    reply: (n) => JSON.stringify({ summary: "S", highlights: [], suggestedActions: [{ title: n === 1 ? title : `Another ${n}`, why: "w" }] }),
  });
  await runNarrative(db, { now: now + 5000, complete: rerun.complete });
  const states = new Map(all<{ id: number; estat: string }>(db, "SELECT id, estat FROM recomanacio").map((r) => [r.id, r.estat]));
  assert.equal(states.get(recs[0]!.id), "aprovada");
  assert.equal(states.get(recs[1]!.id), "descartada");
  assert.equal(all(db, "SELECT id FROM recomanacio WHERE text LIKE ?", `${title}. %`).length, 1);
  assert.equal(all(db, "SELECT id FROM recomanacio WHERE estat = 'proposada'").length, 2);
});

test("alarm link: only to an input alarm with the same domain, or a unique domain match", async () => {
  const { db, now } = seeded();
  const alarmId = Number(
    run(
      db,
      `INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, severity, status, audience)
       VALUES ('sharp_drop', 'Benestar dropped', NULL, 1, '2026-10', 30, 'warning', 'open', 'hr')`,
    ).lastInsertRowid,
  );
  const { complete, calls } = fake();
  await runNarrative(db, { now, complete });
  assert.ok(calls[0]!.user.includes("Benestar dropped"));
  const d = JSON.parse(rowsOf(db).find((r) => r.collectiu_id === null)!.detail_json);
  assert.equal(d.suggestedActions[0].alarmId, alarmId); // unique open alarm in that domain
  assert.equal(one<{ senyal_id: number }>(db, "SELECT senyal_id FROM recomanacio WHERE id = ?", d.suggestedActions[0].recommendationId)!.senyal_id, alarmId);
});

test("stored rows pass listInsights, typed", async () => {
  const { db, now } = seeded();
  await runNarrative(db, { now, complete: fake().complete });
  const views = listInsights(db, { role: "hr" }, { kind: "narrative", periode: "2026-10" });
  assert.equal(views.length, 3);
  for (const v of views) {
    assert.equal(v.kind, "narrative");
    if (v.kind !== "narrative") continue;
    assert.ok(v.detail && v.detail.summary && v.detail.model && v.detail.inputHash);
    assert.ok(v.n >= 10);
  }
  const mgr = listInsights(db, { role: "manager", collectiuId: 1 }, { kind: "narrative", periode: "2026-10" });
  assert.deepEqual(mgr.map((m) => m.collectiuId), [1]);
});

test("llm client: config from env, retries on 5xx and empty content, never leaks the key", async () => {
  assert.throws(() => llmConfigFromEnv({ LLM_BASE_URL: "http://x" }), /LLM_API_KEY/);
  const cfg = { ...llmConfigFromEnv({ LLM_BASE_URL: "http://x/v1/", LLM_API_KEY: "sekret" }), retries: 2 };
  assert.equal(cfg.model, "ornith");
  assert.equal(cfg.baseUrl, "http://x/v1");
  let n = 0;
  const f = (async (_url: string, init: RequestInit) => {
    n++;
    assert.equal((init.headers as Record<string, string>)["Authorization"], "Bearer sekret");
    if (n === 1) return new Response("x", { status: 503 });
    if (n === 2) return Response.json({ choices: [{ message: { content: null } }] });
    return Response.json({ choices: [{ message: { content: "hello" } }] });
  }) as unknown as typeof fetch;
  assert.equal(await createComplete(cfg, f)({ system: "s", user: "u", maxTokens: 1500 }), "hello");
  assert.equal(n, 3);

  const denied = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(createComplete(cfg, denied)({ system: "s", user: "u", maxTokens: 1500 }), (e: Error) => /401/.test(e.message) && !e.message.includes("sekret"));
});
