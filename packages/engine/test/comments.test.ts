import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyComment, copiesComment, runCommentAnalysis, runCommentAnalysisSync, templateSummary } from "../src/comments.ts";
import type { SqlDatabase } from "../src/db.ts";
import { addQuestion, makeDb } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 28, 9, 0, 0); // 2026-10-28
const keys = (t: string) => classifyComment(t).map((m) => m.key);

let seq = 0;
/** Inserts redacted comments for a collective and period. Accounts are reused, the date makes each row unique. */
function comments(db: SqlDatabase, collective: "f" | "o", periode: string, texts: string[]) {
  const q = addQuestion(db, { domain: 6, type: "scale10" });
  texts.forEach((t, i) => {
    seq++;
    db.prepare("INSERT INTO resposta (compte_id, pregunta_id, valor_num, comentari, periode, data) VALUES (?,?,?,?,?,?)").run(
      `${collective}${i % 12}`, q, 5, t, periode, `${periode}-10 10:00:00.${seq}`,
    );
  });
}
const rows = (db: SqlDatabase, sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as Record<string, unknown>[];
const SHIFT = "No sabem amb temps quin torn ens tocarà la setmana vinent.";
const TOOLS = "Les eines informàtiques fallen sovint.";
const dump = (d: SqlDatabase) =>
  JSON.stringify(rows(d, "SELECT etiqueta, resum, periode, n, emergent, suprimit, collectiu_id, clau, font FROM tema ORDER BY periode, collectiu_id, clau"));

test("classification: several themes, Catalan, Spanish and English, typos and accents", () => {
  assert.ok(keys("Arribo molt cansat perquè la càrrega de treball és enorme").length >= 2, "multi-theme");
  assert.ok(keys("Arribo molt cansat perquè la càrrega de treball és enorme").includes("cansament_descans"));
  assert.equal(keys("Las herramientas informaticas van muy lentas")[0], "eines_sistemes");
  assert.equal(keys("We are told about shift changes too late.")[0], "torns_comunicacio_pauses");
  assert.equal(keys("la formacio es massa generica")[0], "formacio"); // missing accent
  assert.equal(keys("La comunicasio interna es dolenta")[0], "comunicacio_interna"); // typo
  assert.equal(keys("Fa molta calor al magatzem i els guants es gasten")[0], "seguretat_calor_epi");
  assert.deepEqual(keys("Bon dia"), []);
});

test("suppression: a collective with fewer than 10 comments gets no summary and no comment links", () => {
  const db = makeDb();
  comments(db, "o", "2026-10", Array(9).fill(TOOLS));
  comments(db, "f", "2026-10", Array(12).fill(TOOLS));
  runCommentAnalysisSync(db, { now: NOW });
  const small = rows(db, "SELECT * FROM tema WHERE collectiu_id = 2 AND clau = 'eines_sistemes'")[0]!;
  assert.equal(small.suprimit, 1);
  assert.equal(small.resum, null);
  assert.equal(small.share, null);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM comentari_tema ct JOIN tema t ON t.id = ct.tema_id WHERE t.collectiu_id = 2")[0]!.n, 0);
  const big = rows(db, "SELECT * FROM tema WHERE collectiu_id = 1 AND clau = 'eines_sistemes'")[0]!;
  assert.equal(big.suprimit, 0);
  assert.match(String(big.resum), /12 comentaris/);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM comentari_tema")[0]!.n, 12);
  // a theme with fewer than 10 comments inside a big group is suppressed too
  comments(db, "f", "2026-10", [SHIFT, SHIFT]);
  runCommentAnalysisSync(db, { now: NOW });
  assert.equal(rows(db, "SELECT suprimit FROM tema WHERE collectiu_id = 1 AND clau = 'torns_comunicacio_pauses'")[0]!.suprimit, 1);
});

test("emergent: opens when a theme's share rises, clears when it falls, respects cooldown", () => {
  const db = makeDb();
  comments(db, "f", "2026-09", [SHIFT, ...Array(11).fill(TOOLS)]); // 8% shift
  comments(db, "f", "2026-10", [...Array(12).fill(SHIFT), ...Array(12).fill(TOOLS)]); // 50% shift
  assert.equal(runCommentAnalysisSync(db, { now: NOW }).emergentOpened, 1);
  const s = rows(db, "SELECT * FROM senyal WHERE tipus = 'emergent'");
  assert.equal(s.length, 1);
  assert.equal(s[0]!.severity, "warning");
  assert.equal(s[0]!.audience, "hr");
  assert.equal(s[0]!.collectiu_id, 1);
  assert.equal(s[0]!.domini_id, 6);
  assert.equal(rows(db, "SELECT emergent FROM tema WHERE clau = 'torns_comunicacio_pauses' AND periode = '2026-10' AND collectiu_id = 1")[0]!.emergent, 1);
  assert.doesNotMatch(String(s[0]!.descripcio), /torn ens tocar/); // never the comment text

  // Idempotent: a second run opens nothing.
  assert.equal(runCommentAnalysisSync(db, { now: NOW + 3_600_000 }).emergentOpened, 0);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM senyal WHERE tipus = 'emergent'")[0]!.n, 1);

  // The share falls back to the September level: the open alarm resolves.
  db.prepare("UPDATE resposta SET comentari = ? WHERE periode = '2026-10' AND comentari = ? AND id % 12 <> 0").run(TOOLS, SHIFT);
  const c = runCommentAnalysisSync(db, { now: NOW + 7_200_000 });
  assert.equal(c.emergentResolved, 1);
  assert.equal(rows(db, "SELECT status FROM senyal WHERE tipus = 'emergent'")[0]!.status, "resolved");
  // Cooldown: a new rise right after does not reopen it.
  db.prepare("UPDATE resposta SET comentari = ? WHERE periode = '2026-10' AND comentari = ?").run(SHIFT, TOOLS);
  assert.equal(runCommentAnalysisSync(db, { now: NOW + 8_000_000 }).emergentOpened, 0);
});

test("emergent needs enough comments in both periods", () => {
  const db = makeDb();
  comments(db, "f", "2026-09", Array(6).fill(TOOLS)); // previous group below 10
  comments(db, "f", "2026-10", Array(14).fill(SHIFT));
  assert.equal(runCommentAnalysisSync(db, { now: NOW }).emergentOpened, 0);
});

test("sensitive content: counted in aggregate, no comment links, no alarm, fixed summary", () => {
  const db = makeDb();
  comments(db, "f", "2026-09", Array(12).fill(TOOLS));
  comments(db, "f", "2026-10", [...Array(12).fill("Hi ha assetjament a la nau, tinc por."), ...Array(12).fill(TOOLS)]);
  runCommentAnalysisSync(db, { now: NOW });
  const t = rows(db, "SELECT * FROM tema WHERE clau = 'sensible' AND collectiu_id = 1")[0]!;
  assert.equal(t.n, 12);
  assert.doesNotMatch(String(t.resum), /nau|por/);
  assert.equal(t.emergent, 0);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM comentari_tema WHERE tema_id = ?", t.id as number)[0]!.n, 0);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM senyal WHERE tipus = 'emergent'")[0]!.n, 0);
});

test("a seeded emergent placeholder is adopted instead of duplicated", () => {
  const db = makeDb();
  comments(db, "f", "2026-09", [SHIFT, ...Array(11).fill(TOOLS)]);
  comments(db, "f", "2026-10", [...Array(12).fill(SHIFT), ...Array(12).fill(TOOLS)]);
  db.prepare("INSERT INTO senyal (tipus, descripcio, collectiu_id, periode, n, confianca) VALUES ('emergent','Comunicació del sistema de torns i pauses',1,'2026-10',31,0.8)").run();
  runCommentAnalysisSync(db, { now: NOW });
  const s = rows(db, "SELECT * FROM senyal WHERE tipus = 'emergent'");
  assert.equal(s.length, 1);
  assert.equal(s[0]!.severity, "warning");
  assert.match(String(s[0]!.descripcio), /tema emergent a Fàbriques/);
});

test("template summaries are aggregate and never copy a comment", () => {
  const db = makeDb();
  comments(db, "f", "2026-10", Array(12).fill(SHIFT));
  runCommentAnalysisSync(db, { now: NOW });
  const resum = String(rows(db, "SELECT resum FROM tema WHERE clau = 'torns_comunicacio_pauses' AND collectiu_id = 1")[0]!.resum);
  assert.equal(copiesComment(resum, [SHIFT]), false);
  assert.equal(copiesComment("Diuen que no sabem amb temps quin torn ens tocarà aquesta setmana", [SHIFT]), true);
  assert.match(templateSummary({ theme: "X", themeKey: "x", periode: "2026-10", collective: null, n: 10, share: 0.5, prevShare: 0.1, emergent: true, coThemes: [] }), /emergent/);
});

test("LLM injection: used when it answers, falls back to rules when it fails or copies a comment", async () => {
  const db = makeDb();
  comments(db, "f", "2026-09", [SHIFT, ...Array(11).fill(TOOLS)]);
  comments(db, "f", "2026-10", [...Array(12).fill(SHIFT), ...Array(12).fill(TOOLS)]);
  const llm = await runCommentAnalysis(db, {
    now: NOW,
    classify: async (cs) => {
      assert.ok(cs.every((c, i) => c.id === i), "local ids, not response ids");
      return new Map(cs.map((c) => [c.id, ["ambient_equip", "no_such_theme"]]));
    },
    summarise: async (i) => (i.emergent ? "El col·lectiu expressa preocupació creixent per la planificació dels horaris de treball." : null),
  });
  assert.equal(llm.source, "llm");
  assert.equal(llm.llmClassified, 36);
  assert.ok(rows(db, "SELECT 1 FROM tema WHERE clau = 'ambient_equip' AND collectiu_id = 1 AND suprimit = 0").length > 0);
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM tema WHERE clau = 'torns_comunicacio_pauses'")[0]!.n, 0, "LLM assignment replaced the rules");

  // Failing LLM: same result as the synchronous deterministic run.
  const a = makeDb();
  const b = makeDb();
  for (const d of [a, b]) {
    comments(d, "f", "2026-09", [SHIFT, ...Array(11).fill(TOOLS)]);
    comments(d, "f", "2026-10", [...Array(12).fill(SHIFT), ...Array(12).fill(TOOLS)]);
  }
  const fallback = await runCommentAnalysis(a, { now: NOW, classify: async () => { throw new Error("down"); }, summarise: async () => { throw new Error("down"); } });
  const plain = runCommentAnalysisSync(b, { now: NOW });
  assert.equal(fallback.source, "rules");
  assert.equal(dump(a), dump(b));
  assert.equal(fallback.emergentOpened, plain.emergentOpened);

  // A summary that copies a comment is rejected.
  const c = makeDb();
  comments(c, "f", "2026-10", Array(12).fill(SHIFT));
  const r = await runCommentAnalysis(c, { now: NOW, summarise: async () => "Diuen que no sabem amb temps quin torn ens tocarà la setmana vinent a la fàbrica." });
  assert.equal(r.llmSummaries, 0);
  assert.equal(rows(c, "SELECT font FROM tema WHERE clau = 'torns_comunicacio_pauses'")[0]!.font, "rules");
});

test("the LLM is never given sensitive comments to summarise", async () => {
  const db = makeDb();
  comments(db, "f", "2026-10", Array(12).fill("Hi ha assetjament a la nau."));
  let calls = 0;
  await runCommentAnalysis(db, { now: NOW, summarise: async () => { calls++; return null; } });
  assert.equal(calls, 0);
});
