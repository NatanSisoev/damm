// One command, one demo database: `pnpm demo-db` (writes data/app.db, the default DB_PATH; `-- --out path` to change).
//
// Single source: the engine demo pipeline (packages/engine/demo/build-demo.ts: simulated world, answers, comments,
// engine job, comment analysis, recommendations). This script wraps it with
//   - participation tuned so that no segment (collective x shift) is below the minimum group size of 10 and no score has
//     very low confidence (night shifts get more accounts),
//   - comment pools in ca / es / en (an account's comments are in its own language),
//   - a trilingual post-pass: question bank (text_i18n), the HR need, the adopted recommendation, themes, recommendations
//     and the signal text get Catalan as the canonical column and es/en rows in `traduccio`.
// The old seed pipeline (packages/seed) is legacy; this is the one database for dev, e2e and Railway.
// Run: node --experimental-strip-types --experimental-sqlite --no-warnings scripts/build-demo-db.mts
import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildDemo, LIVE_TRIGGER } from "../packages/engine/demo/build-demo.ts";
import { COMMENTS as EN_COMMENTS, THEME_COMMENTS as EN_THEME_COMMENTS } from "../packages/engine/demo/comments.ts";
import {
  ADOPTED_REC, CA_POOL, COLLECTIVE, CONTEXT_EVENT, DOMAIN, ES_POOL, Misses, NEED, SIGNAL_DESC, translateRecRationale, translateRecText,
  translateRecTitle, translateResum, type Lang, type Tri,
} from "./demo-db/i18n-content.mts";

const REPO = resolve(import.meta.dirname, "..");
const { values } = parseArgs({ args: process.argv.slice(2).filter((a) => a !== "--"), options: { out: { type: "string" }, seed: { type: "string" } }, allowPositionals: true });
const out = values.out ?? "data/app.db";
rmSync(`${out}.pristine`, { force: true }); // a rebuilt DB invalidates the demo-reset snapshot (N-17)
const LANGS: Lang[] = ["ca", "es", "en"];

/**
 * Participation override per "collectiuId:tornId", applied before the demo's 1.6 scale. Story for the representativeness
 * warning: night shifts answer clearly less than day shifts (Fàbriques nit about 30% of its people vs 48-56% on days,
 * Logística nit about 22%), while every segment still reaches n >= 10.
 */
const PARTICIPATION = { "1:3": 0.19, "2:3": 0.14 };

/** Synthetic decision trail: HR approves AI drafts, edits one, adopts a recommendation, publishes the need, acknowledges an alarm. */
function seedDecisions(d: DatabaseSync): void {
  const ins = d.prepare(
    "INSERT INTO decisio (created_at, entity, entity_id, necessitat_id, action, from_state, to_state, font, actor, subject, text_original, text_final) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const need = d.prepare("SELECT id, titol, text_nl FROM necessitat ORDER BY id LIMIT 1").get() as { id: number; titol: string | null; text_nl: string } | undefined;
  if (need) {
    const qs = d.prepare("SELECT id, text FROM pregunta WHERE necessitat_id = ? ORDER BY id").all(need.id) as { id: number; text: string }[];
    const label = need.titol ?? need.text_nl.slice(0, 80);
    qs.forEach((q, i) => {
      const at = `2026-10-0${3 + i} 09:${10 + i * 7}:00`;
      if (i === 0) ins.run(at, "pregunta", q.id, need.id, "edit", "esborrany", "esborrany", "hr_edit", "hr-demo", q.text, "Com valores el sistema de torns actual?", q.text);
      ins.run(`2026-10-0${3 + i} 09:${30 + i * 5}:00`, "pregunta", q.id, need.id, "approve", "esborrany", "aprovada", "ai_draft", "hr-demo", q.text, null, null);
    });
    ins.run("2026-10-04 10:05:00", "necessitat", need.id, need.id, "publish", "aprovada", "publicada", "hr_need", "hr-demo", label, null, null);
  }
  const rec = d.prepare("SELECT id, COALESCE(titol, text) AS s FROM recomanacio WHERE aprovada_el IS NOT NULL ORDER BY id LIMIT 1").get() as { id: number; s: string } | undefined;
  if (rec) ins.run("2026-10-21 11:20:00", "recomanacio", rec.id, null, "approve", "proposta", "aprovada", "ai_recommendation", "hr-demo", rec.s.slice(0, 200), null, null);
  const sig = d.prepare("SELECT id, descripcio FROM senyal ORDER BY id LIMIT 1").get() as { id: number; descripcio: string } | undefined;
  if (sig) ins.run("2026-10-22 08:45:00", "senyal", sig.id, null, "status", "nova", "reconeguda", "engine_alarm", "hr-demo", sig.descripcio.slice(0, 200), null, null);
}

/** One company-wide and one per-collective narrative for the latest period, from the aggregates. Catalan in the
 *  canonical fields, es/en in detail.i18n (read by apps/web/app/hr/analytics.ts getNarrative). */
function addNarratives(d: DatabaseSync): void {
  const periode = (d.prepare("SELECT MAX(periode) AS p FROM agregat").get() as { p: string }).p;
  const scopes: (string | null)[] = [null, ...(d.prepare("SELECT nom FROM collectiu ORDER BY id").all() as { nom: string }[]).map((c) => c.nom)];
  const ins = d.prepare("INSERT INTO insight (kind, periode, collectiu_id, torn_id, domini_id, n, value, detail_json, suprimit, created_at) VALUES ('narrative', ?, ?, NULL, NULL, ?, NULL, ?, 0, datetime('now'))");
  const f1 = (x: number) => x.toFixed(1);
  for (const col of scopes) {
    const cid = col ? (d.prepare("SELECT id FROM collectiu WHERE nom = ?").get(col) as { id: number }).id : null;
    const rows = d.prepare(
      `SELECT d.nom AS dom, AVG(a.score) AS s, SUM(a.n) AS n FROM agregat a JOIN domini d ON d.id = a.domini_id
       WHERE a.periode = ? AND a.torn_id IS NULL AND a.score IS NOT NULL AND a.suprimit = 0 AND ${cid === null ? "a.collectiu_id IS NOT NULL" : "a.collectiu_id = ?"}
       GROUP BY d.id ORDER BY s DESC`,
    ).all(...(cid === null ? [periode] : [periode, cid])) as { dom: string; s: number; n: number }[];
    if (rows.length < 2) continue;
    const best = rows[0]!, worst = rows[rows.length - 1]!;
    const avg = rows.reduce((x, r) => x + r.s, 0) / rows.length;
    const n = Math.max(...rows.map((r) => r.n));
    const who = col ? COLLECTIVE[col] ?? { ca: col, es: col, en: col } : { ca: "tota l'empresa", es: "toda la empresa", en: "the whole company" };
    const T = (k: Lang) => {
      const dn = (name: string) => (DOMAIN[name] ?? { ca: name, es: name, en: name })[k];
      const summary = {
        ca: `Nota mitjana ${f1(avg)} sobre 10 a ${who.ca} (${periode}). El domini més fort és ${dn(best.dom)} (${f1(best.s)}) i el més fluix, ${dn(worst.dom)} (${f1(worst.s)}).`,
        es: `Nota media ${f1(avg)} sobre 10 en ${who.es} (${periode}). El dominio más fuerte es ${dn(best.dom)} (${f1(best.s)}) y el más débil, ${dn(worst.dom)} (${f1(worst.s)}).`,
        en: `Average score ${f1(avg)} out of 10 for ${who.en} (${periode}). The strongest domain is ${dn(best.dom)} (${f1(best.s)}) and the weakest is ${dn(worst.dom)} (${f1(worst.s)}).`,
      }[k];
      const hl = [
        { text: { ca: `${dn(best.dom)} és el punt fort.`, es: `${dn(best.dom)} es el punto fuerte.`, en: `${dn(best.dom)} is the strength.` }[k],
          evidence: { ca: `Puntuació ${f1(best.s)}/10, n ≥ 10.`, es: `Puntuación ${f1(best.s)}/10, n ≥ 10.`, en: `Score ${f1(best.s)}/10, n ≥ 10.` }[k] },
        { text: { ca: `${dn(worst.dom)} és l'àrea a vigilar.`, es: `${dn(worst.dom)} es el área a vigilar.`, en: `${dn(worst.dom)} is the area to watch.` }[k],
          evidence: { ca: `Puntuació ${f1(worst.s)}/10, n ≥ 10.`, es: `Puntuación ${f1(worst.s)}/10, n ≥ 10.`, en: `Score ${f1(worst.s)}/10, n ≥ 10.` }[k] },
      ];
      return { summary, hl };
    };
    const ca = T("ca"), es = T("es"), en = T("en");
    const detail = {
      labels: { collective: col ?? "All", shift: null, domain: null },
      summary: ca.summary,
      highlights: ca.hl.map((h) => ({ ...h, domain: null })),
      suggestedActions: [],
      recommendationIds: [],
      model: "demo-template",
      inputHash: `demo-${periode}-${col ?? "all"}`,
      i18n: { es: { summary: es.summary, highlights: es.hl }, en: { summary: en.summary, highlights: en.hl } },
    };
    ins.run(periode, cid, n, JSON.stringify(detail));
  }
}

const started = Date.now();
// Pools are indexed by account idx % 3: 0 -> ca, 1 -> es, 2 -> en (see the lang pass below).
const summary = await buildDemo({
  out,
  seed: values.seed,
  participation: PARTICIPATION,
  commentPools: [CA_POOL, ES_POOL, { COMMENTS: EN_COMMENTS, THEME_COMMENTS: EN_THEME_COMMENTS }],
  log: (m) => console.log(m),
});

// ---------------------------------------------------------------------------------------------------------------
// Trilingual post-pass (node:sqlite, same engine as the builder).
const db = new DatabaseSync(summary.path);
db.exec("PRAGMA journal_mode = WAL");
const misses = new Misses();
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const put = db.prepare("INSERT OR REPLACE INTO traduccio (entitat, entitat_id, camp, lang, text) VALUES (?, ?, ?, ?, ?)");
const putTri = (entity: string, id: number, field: string, t: Tri) => {
  for (const l of ["es", "en"] as const) put.run(entity, id, field, l, t[l]);
};

db.exec("BEGIN");
try {
  // 1. Account language, matching the comment pool each account's comments came from.
  const accounts = db.prepare("SELECT id, username FROM compte").all() as { id: number; username: string }[];
  const setLang = db.prepare("UPDATE compte SET lang = ? WHERE id = ?");
  for (const a of accounts) {
    const idx = Number(/^demo(\d+)$/.exec(a.username)?.[1]);
    if (Number.isFinite(idx)) setLang.run(LANGS[idx % 3], a.id);
  }

  // 2. Question bank: ca canonical text, text_i18n and option i18n from docs/i18n/question-bank-translations.json.
  const bank = JSON.parse(readFileSync(resolve(REPO, "docs/i18n/question-bank-translations.json"), "utf8")) as {
    questions: { text: Tri; options?: Tri[] }[];
  };
  const byText = new Map<string, { text: Tri; options?: Tri[] }>();
  for (const q of bank.questions) for (const t of [q.text.ca, q.text.en]) if (t) byText.set(norm(t), q);
  const rows = db.prepare("SELECT id, text, options_json FROM pregunta WHERE text_i18n IS NULL AND necessitat_id IS NULL").all() as {
    id: number; text: string; options_json: string | null;
  }[];
  const updQ = db.prepare("UPDATE pregunta SET text = ?, text_i18n = ?, options_json = ? WHERE id = ?");
  let translatedQ = 0;
  for (const r of rows) {
    const e = byText.get(norm(r.text));
    if (!e) {
      misses.add("question", r.text);
      continue;
    }
    let optionsJson = r.options_json;
    if (optionsJson && e.options) {
      const arr = JSON.parse(optionsJson) as Record<string, unknown>[];
      if (Array.isArray(arr) && arr.length === e.options.length) optionsJson = JSON.stringify(arr.map((o, k) => ({ ...o, i18n: e.options![k] })));
      else misses.add("question-options", r.text);
    }
    updQ.run(e.text.ca, JSON.stringify(e.text), optionsJson, r.id);
    translatedQ++;
  }

  // 3. The HR need and its two approved questions.
  db.prepare("UPDATE necessitat SET text_nl = ?, titol = ?, intro = ? WHERE id = 1").run(NEED.text_nl.ca, NEED.titol.ca, NEED.intro.ca);
  putTri("necessitat", 1, "text_nl", NEED.text_nl);
  putTri("necessitat", 1, "titol", NEED.titol);
  putTri("necessitat", 1, "intro", NEED.intro);
  for (const q of NEED.questions) {
    db.prepare("UPDATE pregunta SET text = ?, text_i18n = ? WHERE necessitat_id = 1 AND tipus = ?").run(q.text.ca, JSON.stringify(q.text), q.type);
  }

  // 3b. The live-trigger need (Comercial, Desenvolupament): found by its English marker text, not by id.
  const liveNeed = db.prepare("SELECT id FROM necessitat WHERE text_nl = ?").get(LIVE_TRIGGER.needText) as { id: number } | undefined;
  if (liveNeed) {
    const LIVE_NEED: Tri = {
      ca: "Volem saber quin marge de creixement tenen a Comercial en el seu lloc de feina.",
      es: "Queremos saber qué margen de crecimiento tienen en Comercial en su puesto de trabajo.",
      en: LIVE_TRIGGER.needText,
    };
    const LIVE_Q: Tri = {
      ca: "Quin marge tens per créixer en el teu lloc actual?",
      es: "¿Qué margen tienes para crecer en tu puesto actual?",
      en: LIVE_TRIGGER.questionText,
    };
    db.prepare("UPDATE necessitat SET text_nl = ? WHERE id = ?").run(LIVE_NEED.ca, liveNeed.id);
    putTri("necessitat", liveNeed.id, "text_nl", LIVE_NEED);
    db.prepare("UPDATE pregunta SET text = ?, text_i18n = ? WHERE necessitat_id = ?").run(LIVE_Q.ca, JSON.stringify(LIVE_Q), liveNeed.id);
  } else misses.add("live-need", LIVE_TRIGGER.needText);

  // 4. Adopted recommendation, planted signal and context event: Catalan canonical, es/en in `traduccio`.
  const adopted = db.prepare("SELECT id FROM recomanacio WHERE aprovada_el IS NOT NULL AND senyal_id IS NOT NULL ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  if (adopted) {
    db.prepare("UPDATE recomanacio SET text = ? WHERE id = ?").run(ADOPTED_REC.ca, adopted.id);
    putTri("recomanacio", adopted.id, "text", ADOPTED_REC);
  }
  const planted = db.prepare("SELECT id FROM senyal WHERE descripcio = 'Condicions i organització stays low in Logística.'").get() as { id: number } | undefined;
  if (planted) {
    db.prepare("UPDATE senyal SET descripcio = ? WHERE id = ?").run(SIGNAL_DESC.ca, planted.id);
    putTri("senyal", planted.id, "descripcio", SIGNAL_DESC);
  }
  const EN_EVENT = "New shift system in the factories";
  db.prepare("UPDATE context_event SET label = ? WHERE label = ?").run(CONTEXT_EVENT.ca, EN_EVENT);
  // The label is snapshotted into insight detail_json; keep it Catalan too (context_event has no translation overlay).
  db.prepare("UPDATE insight SET detail_json = replace(detail_json, ?, ?) WHERE detail_json LIKE ?").run(EN_EVENT, CONTEXT_EVENT.ca, `%${EN_EVENT}%`);

  // 5. Themes (etiqueta is Catalan; resum is a deterministic Catalan template).
  const themes = db.prepare("SELECT id, etiqueta, resum FROM tema").all() as { id: number; etiqueta: string; resum: string | null }[];
  const { THEME_LABEL } = await import("./demo-db/i18n-content.mts");
  for (const t of themes) {
    const label = THEME_LABEL[t.etiqueta];
    if (!label) misses.add("theme-label", t.etiqueta);
    else putTri("tema", t.id, "etiqueta", label);
    if (t.resum)
      for (const l of ["es", "en"] as const) put.run("tema", t.id, "resum", l, translateResum(t.resum, l, misses));
  }

  // 6. Recommendations: the 7 drafted fields.
  const recs = db.prepare("SELECT id, text, titol, iniciativa, responsable_suggerit, termini_suggerit, justificacio, limits FROM recomanacio").all() as {
    id: number; text: string; titol: string | null; iniciativa: string | null; responsable_suggerit: string | null;
    termini_suggerit: string | null; justificacio: string | null; limits: string | null;
  }[];
  const { REC_SIMPLE } = await import("./demo-db/i18n-content.mts");
  for (const r of recs) {
    if (adopted && r.id === adopted.id) continue;
    for (const l of ["es", "en"] as const) {
      if (r.titol) put.run("recomanacio", r.id, "titol", l, translateRecTitle(r.titol, l, misses));
      put.run("recomanacio", r.id, "text", l, translateRecText(r.text, l, misses));
      if (r.iniciativa) put.run("recomanacio", r.id, "iniciativa", l, REC_SIMPLE.initiative(r.iniciativa, l, misses));
      if (r.responsable_suggerit) put.run("recomanacio", r.id, "responsable_suggerit", l, REC_SIMPLE.owner(r.responsable_suggerit, l, misses));
      if (r.termini_suggerit) put.run("recomanacio", r.id, "termini_suggerit", l, REC_SIMPLE.timeframe(r.termini_suggerit, l, misses));
      if (r.justificacio) put.run("recomanacio", r.id, "justificacio", l, translateRecRationale(r.justificacio, l, misses));
      if (r.limits) put.run("recomanacio", r.id, "limits", l, REC_SIMPLE.limits(r.limits, l, misses));
    }
  }
  // 6b. A few synthetic HR decisions so the traceability page is not empty (R-PRIV-10, N-11). HR labels only, no employee data.
  seedDecisions(db);
  // 7. Narrative summaries (the engine writes these with an LLM; the demo DB gets deterministic trilingual ones).
  addNarratives(db);
  db.exec("COMMIT");
  console.log(`i18n: ${accounts.length} account languages, ${translatedQ}/${rows.length} bank questions, ${themes.length} themes, ${recs.length} recommendations`);
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();

if (misses.list.length) {
  const byKind = new Map<string, number>();
  for (const m of misses.list) byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);
  console.error(`WARNING: ${misses.list.length} strings stayed Catalan (no translation known):`);
  for (const [k, n] of byKind) console.error(`  ${k}: ${n}`);
  for (const m of misses.list.slice(0, 15)) console.error(`  [${m.kind}] ${m.text.slice(0, 160)}`);
  process.exitCode = 1;
}
console.log(JSON.stringify({ ...summary, i18nMisses: misses.list.length }, null, 2));
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${summary.path}`);
