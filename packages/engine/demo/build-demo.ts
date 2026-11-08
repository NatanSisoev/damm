// Builds a demo database with three months of synthetic answers, so the dashboard shows real scores,
// insights and alarms. Synthetic data only: invented people, invented answers, template comments.
//
// Usage: pnpm --filter @damm/engine run demo [-- --out data/demo.db --seed damm-demo]
// Then point the app at it: DB_PATH=data/demo.db pnpm dev
//
// Stories planted on top of the simulator's world (sim/world.ts), so they show up on the dashboard:
//   - Fàbriques, Condicions: sharp drop from 1 October (shift-change communication)  -> sharp_drop, top_mover
//   - Logística, Condicions: slow decline from mid-August (heat, safety equipment)    -> sustained_decline / feble
//   - Logística morning shift, Lideratge: a cluster of personal drops from 8 October  -> follow-ups, changepoint_cluster
//   - Oficines, Entorn i relacions: the group splits in October, mean unchanged       -> polarisation
//   - Managers answer more positively than others                                     -> segment_gap (manager)
//   - Night shifts have few accounts                                                   -> suppressed segments (n < 10)
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { COLLECTIUS, DOMINIS } from "@damm/shared";
import { createEngine, type BatchItem } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { runCommentAnalysisSync } from "../src/comments.ts";
import { runRecommendations } from "../src/recommendations.ts";
import { templateRecommendations } from "../../ai/src/recommendations.ts";
import { setFormatPreference } from "../src/hr.ts";
import { all, run, transaction, type SqlDatabase } from "../src/db.ts";
import { createRng, pick, type Rng } from "../src/rng.ts";
import type { QuestionDef } from "../src/normalize.ts";
import { toQuestion } from "../src/store.ts";
import { createWorld, normal, type Person } from "../sim/world.ts";
import { loadQuestionBank } from "../fixtures/load-question-bank.ts";
import { COMMENTS, THEME_COMMENTS } from "./comments.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const DAY_MS = 86_400_000;

export interface DemoOptions {
  out?: string;
  seed?: string;
  days?: number;
  start?: string;
  /** Per-stratum participation override, keyed "collectiuId:tornId" (see sim/world.ts). */
  participation?: Record<string, number>;
  /** Comment pools; an account uses pools[idx % pools.length] (default: the English pool in ./comments.ts). */
  commentPools?: CommentPool[];
  log?: (msg: string) => void;
}

export interface CommentPool {
  COMMENTS: typeof COMMENTS;
  THEME_COMMENTS: typeof THEME_COMMENTS;
}

export interface DemoSummary {
  path: string;
  people: number;
  accounts: number;
  questions: number;
  answers: number;
  comments: number;
  alarms: Record<string, number>;
  insights: Record<string, number>;
  recommendations: number;
  alarmsWithoutRecommendation: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Very small PII scrubber for the demo (emails, phone numbers). The real app injects the AI module's redactor. */
const redact = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\+?\d[\d\s-]{7,}\d/g, "[phone]");

export async function buildDemo(opts: DemoOptions = {}): Promise<DemoSummary> {
  const log = opts.log ?? (() => {});
  const path = resolve(REPO, opts.out ?? "data/demo.db");
  const seed = opts.seed ?? "damm-demo";
  mkdirSync(dirname(path), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);

  const db = new DatabaseSync(path) as unknown as SqlDatabase & { close(): void };
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(readFileSync(resolve(REPO, "packages/db/schema.sql"), "utf8"));

  const world = createWorld({ seed, start: opts.start ?? "2026-08-01", days: opts.days ?? 92, participationScale: 1.6, participation: opts.participation });
  const rng = createRng(`demo|${seed}`);

  // --- reference data, population, accounts ------------------------------------------------
  transaction(db, () => {
    DOMINIS.forEach((nom, i) => run(db, "INSERT INTO domini (id, nom) VALUES (?, ?)", i + 1, nom));
    COLLECTIUS.forEach((nom, i) => run(db, "INSERT INTO collectiu (id, nom) VALUES (?, ?)", i + 1, nom));
    ["mati", "tarda", "nit"].forEach((nom, i) => run(db, "INSERT INTO torn (id, nom) VALUES (?, ?)", i + 1, nom));
    ["fabrica", "magatzem", "oficina", "comercial"].forEach((nom, i) => run(db, "INSERT INTO centre_tipus (id, nom) VALUES (?, ?)", i + 1, nom));
    for (const c of world.collectives)
      run(db, "INSERT INTO joincode (codi, empresa, collectiu_id) VALUES (?, 'Demo', ?)", `DEMO-${c.name.slice(0, 3).toUpperCase()}`, c.id);
    const centre = new Map(world.collectives.map((c) => [c.id, c.centreTipusId]));
    const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id, es_manager) VALUES (?,?,?,?)");
    const acc = db.prepare(
      "INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, es_manager, username, password_hash, salt, creat) VALUES (?,?,?,?,?,?, 'demo', 'demo', ?)",
    );
    for (const p of world.people) {
      emp.run(p.collectiuId, centre.get(p.collectiuId)!, p.tornId, p.manager ? 1 : 0);
      if (p.accountId) acc.run(p.accountId, p.collectiuId, centre.get(p.collectiuId)!, p.tornId, p.manager ? 1 : 0, `demo${p.idx}`, `${world.start} 08:00:00`);
    }
  });

  // --- questions, one HR need, format preferences --------------------------------------------
  loadQuestionBank(db);
  transaction(db, () => {
    run(
      db,
      "INSERT INTO necessitat (id, text_nl, collectiu_id, estat, creat) VALUES (1, ?, 1, 'publicada', '2026-10-05 09:00:00')",
      "We want to know how well shift changes are being communicated in the factories.",
    );
    const need = "INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, facet, polarity, necessitat_id, estat, prioritat, aprovada_per, aprovada_el) VALUES (6, 1, ?, ?, 'shift_change_notice', 1, 1, 'aprovada', 10, 'HR demo', '2026-10-05 10:00:00')";
    run(db, need, "This month, were you told about changes to your shift in good time?", "yes_no");
    run(db, need, "How clear is the communication about shift changes?", "scale5");
  });
  const prefs: Record<number, Partial<Record<string, number>>> = {
    1: { yes_no: 3, scale5: 2, pair: 1, scale10: 1, choice: 0.5, ranking: 0.4, open: 0.5 }, // factories: quick formats
    2: { yes_no: 3, scale5: 2, pair: 1, scale10: 1, choice: 0.5, ranking: 0.4, open: 0.5 }, // logistics: quick formats
    3: { yes_no: 2, scale5: 1.5, scale10: 1, pair: 1, choice: 1, ranking: 0.7, open: 0.7 }, // field sales
    4: { ranking: 1.5, choice: 1.5, scale10: 1.2, scale5: 1, pair: 1, yes_no: 0.8, open: 1 }, // offices: reading formats
  };
  for (const [c, m] of Object.entries(prefs))
    for (const [type, weight] of Object.entries(m)) setFormatPreference(db, { collectiuId: Number(c), type: type as never, weight: weight! });

  const questions = new Map(
    all<Parameters<typeof toQuestion>[0]>(db, "SELECT id, domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, necessitat_id, prioritat FROM pregunta").map(
      (r) => [r.id, toQuestion(r)],
    ),
  );
  // Wording bias per question, centred around 0 (some wordings get systematically higher answers).
  const wordingBias = new Map([...questions.keys()].map((id) => [id, 0.05 * normal(createRng(`bias|${seed}|${id}`))]));

  // --- truth: the simulator's latent levels plus the demo stories ---------------------------
  const t0 = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${world.start}T00:00:00Z`)) / DAY_MS);
  const clusterAccounts = new Set(
    world.accounts
      .filter((p) => p.collectiuId === 2 && p.tornId === 1)
      .slice(0, 22)
      .map((p) => p.accountId!),
  );
  // Onset mid-October so the follow-ups confirm inside the alarm's 14-day window at the end of the month.
  const extra = (p: Person, d: number, t: number): number => {
    let x = 0;
    if (d === 2 && clusterAccounts.has(p.accountId!) && t >= t0("2026-10-14")) x -= 0.4;
    if (d === 5 && p.collectiuId === 4 && t >= t0("2026-10-01")) x += p.idx % 2 === 0 ? 0.24 : -0.24;
    // "Listen again" story: Logística is low on Condicions i organització until HR adopts a recommendation on 15 Sep, then improves.
    if (d === 6 && p.collectiuId === 2) x += t < t0("2026-09-15") ? -0.08 : t >= t0("2026-09-20") ? 0.08 : 0;
    return x;
  };
  const truth = (p: Person, d: number, t: number) => clamp(world.level(p.idx, d, t) + extra(p, d, t), 0.02, 0.98);

  const comment = (r: Rng, p: Person, q: QuestionDef, level: number, t: number): string => {
    const day = world.dates[t]!;
    const pools = opts.commentPools?.length ? opts.commentPools : [{ COMMENTS, THEME_COMMENTS }];
    const pool = pools[p.idx % pools.length]!;
    const themes = pool.THEME_COMMENTS.filter((th) => th.collectiuId === p.collectiuId && th.domainId === q.domainId && day >= th.from);
    if (themes.length && level < 0.55 && r() < 0.7) return pick(r, pick(r, themes)!.texts)!;
    const tone = level < 0.45 ? "negative" : level > 0.68 ? "positive" : "neutral";
    return pick(r, pool.COMMENTS[q.domainId]![tone])!;
  };

  const answerFor = (r: Rng, p: Person, item: BatchItem, t: number) => {
    const q = questions.get(item.questionId)!;
    const level = truth(p, q.domainId, t);
    const x = level + (wordingBias.get(q.id) ?? 0) + (p.manager ? world.managerBias : 0);
    const answerMs = r() < 0.06 ? 500 + Math.floor(r() * 800) : Math.round(2200 * Math.exp(0.5 * normal(r)) + 1200);
    const base = { preguntaId: q.id, answerMs };
    // Comments: required for open questions, otherwise more likely when unhappy.
    const wantsComment = q.type === "open" || r() < (level < 0.45 ? 0.2 : 0.04);
    const comentari = wantsComment ? comment(r, p, q, level, t) : null;
    switch (q.type) {
      case "scale10": {
        const s = clamp(Math.round(10 * (x + 0.1 * normal(r))), 0, 10);
        return { ...base, valorNum: q.polarity === 1 ? s : 10 - s, comentari };
      }
      case "scale5": {
        const s = clamp(Math.round(4 * (x + 0.1 * normal(r))), 0, 4);
        return { ...base, valorNum: 1 + (q.polarity === 1 ? s : 4 - s), comentari };
      }
      case "yes_no": {
        const good = r() < clamp(x + 0.05 * normal(r), 0.02, 0.98) ? 1 : 0;
        return { ...base, valorNum: q.polarity === 1 ? good : 1 - good, comentari };
      }
      case "pair":
      case "choice": {
        const opts = (q.options ?? []) as { score: number }[];
        const target = x + 0.1 * normal(r);
        let best = 0;
        opts.forEach((o, i) => {
          if (Math.abs(o.score - target) < Math.abs(opts[best]!.score - target)) best = i;
        });
        return { ...base, valorNum: best, comentari };
      }
      case "ranking": {
        // What would improve things most = the domain where this person is worst off.
        const opts = (q.options ?? []) as { domainId: number }[];
        const order = opts
          .map((o, i) => ({ i, v: truth(p, o.domainId, t) + 0.06 * normal(r) }))
          .sort((a, b) => a.v - b.v)
          .map((o) => o.i);
        return { ...base, valueJson: order, comentari: r() < 0.05 ? comentari : null };
      }
      case "open":
        return { ...base, comentari };
    }
  };

  // --- three months of daily batches through the real engine --------------------------------
  let now = Date.parse(`${world.start}T06:00:00Z`);
  const engine = createEngine({ db, redact, now: () => now });
  let answers = 0;
  const byId = new Map(world.accounts.map((p) => [p.accountId!, p]));
  for (let t = 0; t < world.days; t++) {
    const dayStart = Date.parse(`${world.dates[t]}T05:00:00Z`);
    for (const acct of byId.keys()) {
      const p = byId.get(acct)!;
      const r = createRng(`answer|${seed}|${acct}|${t}`);
      // Everyone answers (current assumption), at a time that fits their shift.
      // Hours after 05:00 UTC; the latest answer is 20:00 UTC, still the same day in Madrid all year.
      const shiftOffset = p.tornId === 2 ? 9 : p.tornId === 3 ? 12 : 3;
      now = dayStart + (shiftOffset + r() * 3) * 3_600_000;
      const batch = engine.getDailyBatch(acct);
      const res = engine.submitAnswers(acct, batch.items.map((it) => answerFor(r, p, it, t)));
      answers += res.accepted.length;
    }
    if (t % 15 === 0) log(`day ${t + 1}/${world.days} (${world.dates[t]}): ${answers} answers so far`);
  }

  // --- listen again: one adoption and one context event ---------------------------------------
  // HR adopted a recommendation for the Logística alarm on 15 Sep (the alarm is HR-owned, so the engine leaves it alone),
  // and recorded the new shift system for Fàbriques on 1 Oct. The job turns both into `action_effect` insights.
  transaction(db, () => {
    const sig = run(
      db,
      `INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, confianca, severity, status, audience, created_at)
       VALUES ('sustained_decline', 'Condicions i organització stays low in Logística.', 2, 6, '2026-08', 40, 70, 'warning', 'action_linked', 'hr_manager', '2026-09-10 08:00:00')`,
    );
    run(
      db,
      "INSERT INTO recomanacio (senyal_id, text, estat, creat, aprovada_el) VALUES (?, ?, 'aprovada', '2026-09-12 09:00:00', '2026-09-15 10:00:00')",
      Number(sig.lastInsertRowid),
      "Review the loading-bay rota and publish it two weeks ahead.",
    );
    run(db, "INSERT INTO context_event (event_date, collectiu_id, domini_id, label) VALUES ('2026-10-01', 1, 6, 'New shift system in the factories')");
  });

  // --- aggregates, insights, alarms -----------------------------------------------------------
  const report = runEngineJob(db, { now: Date.parse(`${world.dates[world.days - 1]}T22:00:00Z`) });
  // Themes, Catalan summaries and emergent alarms from the comments (deterministic: lexicon and templates).
  runCommentAnalysisSync(db, { now: Date.parse(`${world.dates[world.days - 1]}T22:00:00Z`) });
  log(`job: ${report.aggregates} aggregates (${report.suppressed} suppressed), ${report.insights.written} insights, ${report.alarms.opened} alarms opened`);

  // Template proposals only (no key needed); the real job can inject the LLM-backed draftRecommendations instead.
  const recs = await runRecommendations(db, { now: Date.parse(`${world.dates[world.days - 1]}T22:00:00Z`), draft: templateRecommendations });
  log(`recommendations: ${recs.proposals} proposals for ${recs.alarms} alarms`);

  const count = (sql: string) => Object.fromEntries(all<{ k: string; n: number }>(db, sql).map((r) => [r.k, r.n]));
  const summary: DemoSummary = {
    path,
    people: world.people.length,
    accounts: world.accounts.length,
    questions: questions.size,
    answers,
    comments: all<{ n: number }>(db, "SELECT COUNT(*) AS n FROM resposta WHERE comentari IS NOT NULL")[0]!.n,
    alarms: count("SELECT tipus || ' (' || severity || ', ' || status || ')' AS k, COUNT(*) AS n FROM senyal WHERE suprimit = 0 GROUP BY k ORDER BY k"),
    recommendations: all<{ n: number }>(db, "SELECT COUNT(*) AS n FROM recomanacio")[0]!.n,
    alarmsWithoutRecommendation: all<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM senyal s WHERE s.status = 'open' AND s.suprimit = 0 AND NOT EXISTS (SELECT 1 FROM recomanacio r WHERE r.senyal_id = s.id)",
    )[0]!.n,
    insights: count("SELECT kind AS k, COUNT(*) AS n FROM insight WHERE suprimit = 0 GROUP BY kind ORDER BY kind"),
  };
  db.close();
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, seed: { type: "string" }, days: { type: "string" } } });
  const started = Date.now();
  const s = await buildDemo({ out: values.out, seed: values.seed, days: values.days ? Number(values.days) : undefined, log: (m) => console.log(m) });
  console.log(JSON.stringify(s, null, 2));
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${s.path}`);
}
