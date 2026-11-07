import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuestion } from "../src/hr.ts";
import { all } from "../src/db.ts";
import { loadQuestionBank, readQuestionBank } from "../fixtures/load-question-bank.ts";
import { makeDb } from "./helpers.ts";

const bank = readQuestionBank();
const DOMAINS = [1, 2, 3, 4, 5, 6];
const SCORED = new Set(["scale5", "scale10", "yes_no", "pair", "choice"]);

test("every item passes validateQuestion", () => {
  for (const q of bank) {
    const r = validateQuestion(q, DOMAINS);
    assert.ok(r.ok, `${q.facet} "${q.text}": ${r.ok ? "" : r.errors.join("; ")}`);
  }
});

test("every domain has 4-6 facets, a ranking and an open question", () => {
  for (const d of DOMAINS) {
    const items = bank.filter((q) => q.domainId === d);
    const facets = new Set(items.map((q) => q.facet));
    assert.ok(facets.size >= 4 && facets.size <= 6, `domain ${d} has ${facets.size} facets`);
    assert.ok(items.some((q) => q.type === "ranking"), `domain ${d} lacks a ranking`);
    assert.ok(items.some((q) => q.type === "open"), `domain ${d} lacks an open question`);
  }
});

test("scored facets have 3-5 wordings of different types and a follow-up", () => {
  const byFacet = new Map<string, typeof bank>();
  for (const q of bank) {
    const k = `${q.domainId}/${q.facet}`;
    byFacet.set(k, [...(byFacet.get(k) ?? []), q]);
  }
  let scoredFacets = 0;
  for (const [k, items] of byFacet) {
    if (!items.some((q) => SCORED.has(q.type))) continue; // ranking / open facets
    scoredFacets++;
    const main = items.filter((q) => !q.isFollowup);
    const fu = items.filter((q) => q.isFollowup);
    assert.ok(main.length >= 3 && main.length <= 5, `${k}: ${main.length} wordings`);
    assert.ok(new Set(main.map((q) => q.type)).size >= 3, `${k}: fewer than 3 types`);
    assert.ok(fu.length >= 1, `${k}: no follow-up`);
    for (const f of fu) {
      assert.ok(SCORED.has(f.type), `${k}: follow-up must be a closed type`);
      assert.match(f.text, /^A few days ago you told us/, `${k}: follow-up wording`);
    }
  }
  assert.ok(scoredFacets >= 24);
});

test("some negatively worded items, collective-specific items, short texts", () => {
  assert.ok(bank.filter((q) => q.polarity === -1).length >= 10);
  const forColl = (c: number) => bank.filter((q) => q.collectiuId === c);
  assert.ok(forColl(1).some((q) => q.facet === "shift_breaks"));
  assert.ok(forColl(2).some((q) => q.facet === "shift_breaks"));
  assert.ok(forColl(3).some((q) => q.facet === "field_travel"));
  assert.ok(forColl(4).some((q) => q.facet === "remote_work"));
  for (const q of bank) assert.ok(q.text.length <= 140, `too long: ${q.text}`);
  assert.ok(bank.length >= 150 && bank.length <= 200, `size ${bank.length}`);
});

test("pair/choice scores are distinct and within 0..1", () => {
  for (const q of bank.filter((x) => x.type === "pair" || x.type === "choice")) {
    const s = q.options!.map((o) => o.score!);
    assert.equal(new Set(s).size, s.length, q.text);
    for (const v of s) assert.ok(v >= 0 && v <= 1, q.text);
  }
});

test("loadQuestionBank inserts the bank into an in-memory DB", () => {
  const db = makeDb();
  db.prepare("INSERT INTO collectiu (nom) VALUES ('Logística'), ('Comercial')").run();
  const n = loadQuestionBank(db);
  assert.equal(n, bank.length);
  const rows = all<{ tipus: string; options_json: string | null; collectiu_id: number | null; estat: string }>(db, "SELECT * FROM pregunta");
  assert.equal(rows.length, bank.length);
  assert.ok(rows.every((r) => r.estat === "aprovada"));
  const rk = rows.find((r) => r.tipus === "ranking")!;
  assert.ok(JSON.parse(rk.options_json!).every((o: { domain_id?: number }) => typeof o.domain_id === "number"));
  assert.ok(rows.some((r) => r.collectiu_id !== null));
  const db2 = makeDb();
  db2.prepare("INSERT INTO collectiu (nom) VALUES ('Logística'), ('Comercial')").run();
  loadQuestionBank(db2, { estat: "draft" });
  assert.equal(all<{ n: number }>(db2, "SELECT COUNT(*) n FROM pregunta WHERE estat='draft'")[0]!.n, bank.length);
});
