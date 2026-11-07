// Builds a fully seeded dev DB from schema.sql. Deterministic: seeded PRNG, no network, no Math.random.
// Writes RAW data only; the engine job, comment analysis and recommendation proposals then derive everything else.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { COLLECTIUS, DOMINIS, TORNS, MIN_GROUP_SIZE, PERIODES_SEED, type PreguntaTipus } from "@damm/shared";
import { mulberry32, int, pick, shuffle, normal, chance, type Rng } from "./rng";
import { THEMES } from "./themes";
import { CORES, PREFIXES, SUFFIXES } from "./comment-bank";
import { anchorsOf, BANK, EXTRA, type QItem } from "./questions";
import { runEngineJob, runCommentAnalysisSync, runRecommendations } from "@damm/engine/job";
import { templateRecommendations } from "@damm/ai/recommendations";

const root = path.resolve(__dirname, "../../..");
// `--large`: ~650 accounts, ~18k responses and ~2.5k comments, so that every segment, domain and period clears the
// minimum group size and the dashboard looks lived-in. Default (no flag) is unchanged: the small, exact demo dataset.
const LARGE = process.argv.includes("--large");
const out = process.env.DB_PATH ?? path.join(root, LARGE ? "data/large.db" : "data/app.db");
const schema = fs.readFileSync(path.resolve(__dirname, "../../db/schema.sql"), "utf8");
const commentsFile = path.resolve(__dirname, "../data/comments.json");

const r: Rng = mulberry32(20261107);

// ---- Population plan ------------------------------------------------------------
type Seg = { col: string; torn: string | null; pop: number; accounts: number; centre: string; sub?: boolean };
const SEGS_SMALL: Seg[] = [
  { col: "Fàbriques", torn: "mati", pop: 235, accounts: 38, centre: "fabrica" },
  { col: "Fàbriques", torn: "tarda", pop: 185, accounts: 28, centre: "fabrica" },
  { col: "Fàbriques", torn: "nit", pop: 140, accounts: 18, centre: "fabrica" }, // low night response
  { col: "Logística", torn: "mati", pop: 115, accounts: 15, centre: "magatzem" },
  { col: "Logística", torn: "tarda", pop: 105, accounts: 13, centre: "magatzem" },
  { col: "Logística", torn: "nit", pop: 80, accounts: 6, centre: "magatzem", sub: true }, // the single sub-threshold group
  { col: "Comercial", torn: null, pop: 150, accounts: 24, centre: "comercial" },
  { col: "Oficines", torn: null, pop: 190, accounts: 28, centre: "oficina" },
];
const SEGS_LARGE: Seg[] = [
  { col: "Fàbriques", torn: "mati", pop: 235, accounts: 140, centre: "fabrica" },
  { col: "Fàbriques", torn: "tarda", pop: 185, accounts: 105, centre: "fabrica" },
  { col: "Fàbriques", torn: "nit", pop: 140, accounts: 58, centre: "fabrica" }, // lower night response, still well above the threshold
  { col: "Logística", torn: "mati", pop: 115, accounts: 70, centre: "magatzem" },
  { col: "Logística", torn: "tarda", pop: 105, accounts: 62, centre: "magatzem" },
  { col: "Logística", torn: "nit", pop: 80, accounts: 7, centre: "magatzem", sub: true }, // the one deliberately suppressed group
  { col: "Comercial", torn: null, pop: 150, accounts: 95, centre: "comercial" },
  { col: "Oficines", torn: null, pop: 190, accounts: 125, centre: "oficina" },
];
const SEGS = LARGE ? SEGS_LARGE : SEGS_SMALL;
const PERIOD_TARGET: Record<string, number> = LARGE
  ? { "2026-08": 5200, "2026-09": 6100, "2026-10": 6900 }
  : { "2026-08": 200, "2026-09": 230, "2026-10": 270 }; // 700
const P_ACTIVE: Record<string, number> = LARGE
  ? { "2026-08": 0.72, "2026-09": 0.8, "2026-10": 0.86 } // adoption grows month by month
  : { "2026-08": 0.8, "2026-09": 0.85, "2026-10": 0.9 };
const MAX_PER_ACCOUNT = LARGE ? 30 : 7;
const CENTRES = ["fabrica", "magatzem", "oficina", "comercial"];

// ---- Score model (5-point latent scale) ---------------------------------------------
const BASE: Record<string, number[]> = {
  "Fàbriques": [3.4, 3.5, 3.2, 3.6, 3.7, 3.1],
  "Logística": [3.3, 3.4, 3.3, 3.5, 3.6, 3.3],
  "Comercial": [3.7, 3.6, 3.8, 3.8, 3.7, 3.5],
  "Oficines": [3.6, 3.5, 3.4, 3.7, 3.9, 3.6],
};
const PERIOD_DRIFT: Record<string, number> = { "2026-08": 0, "2026-09": -0.05, "2026-10": -0.1 };
const MANAGER_BONUS = 0.7; // manager positivity bias

function latent(col: string, dom: number, periode: string, torn: string | null, manager: boolean, key?: string, bias = 0): number {
  let x = BASE[col][dom] + PERIOD_DRIFT[periode] + (torn === "nit" ? -0.3 : 0) + (manager ? MANAGER_BONUS : 0) + bias;
  if (col === "Fàbriques" && (key === "torns" || key === "pauses")) x += periode === "2026-10" ? -1.1 : periode === "2026-09" ? -0.2 : 0;
  if (col === "Logística" && key === "calor") x += -0.9;
  if (col === "Logística" && key === "epi") x += -0.6;
  return x + normal(r) * 0.9;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function valueFor(tipus: PreguntaTipus, x: number): number | null {
  switch (tipus) {
    case "scale5": return clamp(Math.round(x), 1, 5);
    case "scale10": return clamp(Math.round(x * 2), 0, 10);
    case "yes_no": return chance(r, clamp((x - 1) / 4, 0.05, 0.95)) ? 1 : 0;
    case "ranking": return int(r, 1, 5); // position (1 = top priority) given to the first listed option
    case "open": return null;
  }
}

// ---- Build ---------------------------------------------------------------------------
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
const db = new Database(out);
db.exec(schema);

const colId = new Map<string, number>(), domId = new Map<string, number>(), tornId = new Map<string, number>(), centreId = new Map<string, number>();
COLLECTIUS.forEach((n, i) => { db.prepare("INSERT INTO collectiu (nom) VALUES (?)").run(n); colId.set(n, i + 1); });
DOMINIS.forEach((n, i) => { db.prepare("INSERT INTO domini (nom) VALUES (?)").run(n); domId.set(n, i + 1); });
TORNS.forEach((n, i) => { db.prepare("INSERT INTO torn (nom) VALUES (?)").run(n); tornId.set(n, i + 1); });
CENTRES.forEach((n, i) => { db.prepare("INSERT INTO centre_tipus (nom) VALUES (?)").run(n); centreId.set(n, i + 1); });

// Join codes (one per collective)
const CODES: Record<string, string> = { "Fàbriques": "DAMM-FAB", "Logística": "DAMM-LOG", "Comercial": "DAMM-COM", "Oficines": "DAMM-OFI" };
for (const c of COLLECTIUS)
  db.prepare("INSERT INTO joincode (codi, empresa, collectiu_id) VALUES (?,?,?)").run(CODES[c], "Empresa Demo (sintètica)", colId.get(c));

// Synthetic population
const insEmp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id, es_manager) VALUES (?,?,?,?)");
for (const s of SEGS)
  for (let i = 0; i < s.pop; i++)
    insEmp.run(colId.get(s.col), centreId.get(s.centre), s.torn ? tornId.get(s.torn) : null, chance(r, 0.09) ? 1 : 0);

// Approved question pool: a different rotated subset per collective and domain
interface Q { id: number; col: string; dom: number; domNom: string; item: QItem }
const pool: Q[] = [];
const insQ = db.prepare(
  `INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, facet, necessitat_id, estat, prioritat, generada_per_ia, aprovada_per, aprovada_el, options_json)
   VALUES (?,?,?,?,?,NULL,'aprovada',0,0,'seed','2026-07-30 09:00:00',?)`,
);
// Scale questions carry their low/high anchors as two scored labels (existing options_json shape).
function scaleOptionsJson(item: QItem): string | null {
  const a = anchorsOf(item);
  if (!a) return null;
  return JSON.stringify([{ label: a[0], score: 0 }, { label: a[1], score: item.tipus === "scale10" ? 10 : 5 }]);
}
COLLECTIUS.forEach((col, k) => {
  DOMINIS.forEach((domNom, d) => {
    const items: QItem[] = [0, 1, 2, 3].map((j) => BANK[domNom][(k * 2 + j) % 7]);
    if ((d + k) % 2 === 0) items.push(BANK[domNom][7]);
    for (const e of EXTRA[col] ?? []) if (e.domini === domNom) items.push(e.item);
    for (const item of items) {
      const id = Number(insQ.run(domId.get(domNom), colId.get(col), item.text, item.tipus, item.facet ?? null, scaleOptionsJson(item)).lastInsertRowid);
      pool.push({ id, col, dom: d, domNom, item });
    }
  });
});

// Accounts (opaque id, fake salted hash, no personal data)
const ADJ = ["blau", "rapid", "tranquil", "valent", "alegre", "savi", "ferm", "lleuger", "brau", "curios"];
const NOU = ["pardal", "roure", "far", "riu", "cim", "vent", "falcó", "bosc", "mar", "estel"];
interface Acc { id: string; col: string; torn: string | null; manager: boolean; seg: Seg; bias: number; joinDay: number }
const accs: Acc[] = [];
const usedIds = new Set<string>(), usedNames = new Set<string>();
const insAcc = db.prepare(
  `INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, es_manager, username, password_hash, salt, recovery_hash, creat)
   VALUES (?,?,?,?,?,?,?,?,NULL,?)`,
);
for (const s of SEGS) {
  for (let i = 0; i < s.accounts; i++) {
    let id: string;
    do { id = Array.from({ length: 16 }, () => int(r, 0, 15).toString(16)).join(""); } while (usedIds.has(id));
    usedIds.add(id);
    let uname: string;
    do { uname = `${pick(r, NOU)}_${pick(r, ADJ)}${int(r, 10, 99)}`; } while (usedNames.has(uname));
    usedNames.add(uname);
    const salt = Array.from({ length: 16 }, () => int(r, 0, 15).toString(16)).join("");
    const hash = crypto.createHash("sha256").update(salt + "synthetic-not-a-real-password").digest("hex"); // fake, deterministic
    const manager = chance(r, 0.14);
    // Large profile: staggered onboarding (days after 1 Aug, front-loaded) and a stable personal bias.
    const joinDay = LARGE ? Math.min(75, Math.floor(-Math.log(Math.max(r(), 1e-9)) * 18)) : 0;
    const bias = LARGE ? normal(r) * 0.45 : 0;
    const created = new Date(Date.UTC(2026, 7, 1 + joinDay, int(r, 6, 17), int(r, 0, 59))).toISOString().replace("T", " ").slice(0, 19);
    insAcc.run(id, colId.get(s.col), centreId.get(s.centre), s.torn ? tornId.get(s.torn) : null, manager ? 1 : 0, uname, hash, salt, LARGE ? created : "2026-08-01 06:00:00");
    accs.push({ id, col: s.col, torn: s.torn, manager, seg: s, bias, joinDay });
  }
}

// Responses
interface Row {
  acc: Acc; q: Q; periode: string; data: string; valor: number | null; tipus: PreguntaTipus; comentari?: string; tema?: string;
}
const rows: Row[] = [];
const hourFor = (torn: string | null) => (torn === "nit" ? pick(r, [22, 23, 0, 1, 2, 3, 4]) : torn === "tarda" ? int(r, 14, 20) : int(r, 7, 13));
const pad = (n: number) => String(n).padStart(2, "0");

function qWeight(a: Acc, q: Q, periode: string): number {
  let w = q.item.tipus === "open" ? 0.6 : 1;
  const k = q.item.key;
  if (a.col === "Fàbriques" && periode === "2026-10" && (k === "torns" || k === "pauses" || k === "torns_obert")) w *= 3;
  if (a.col === "Logística" && (k === "calor" || k === "epi")) w *= 2;
  return w;
}
function sampleQuestions(a: Acc, periode: string, n: number): Q[] {
  const cand = pool.filter((q) => q.col === a.col);
  const keyed = cand.map((q) => ({ q, k: -Math.log(Math.max(r(), 1e-12)) / qWeight(a, q, periode) }));
  keyed.sort((x, y) => x.k - y.k);
  return keyed.slice(0, n).map((x) => x.q);
}

// ---- Large profile: realistic visit calendar ---------------------------------------------
const MONTH_DAYS: Record<string, number> = { "2026-08": 31, "2026-09": 30, "2026-10": 31 };
const DOW_W = [1.1, 1.15, 1.1, 1.0, 0.85, 0.3, 0.2]; // Mon..Sun
const visits = new Map<string, { hour: number; min: number }>();
function dayWeight(periode: string, day: number): number {
  const [y, m] = periode.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
  let w = DOW_W[dow];
  if (periode === "2026-08" && day >= 10 && day <= 24) w *= 0.55; // summer holidays
  return w;
}
function activeDays(a: Acc, periode: string, k: number): number[] {
  const n = MONTH_DAYS[periode];
  const [y, m] = periode.split("-").map(Number);
  const join = new Date(Date.UTC(2026, 7, 1 + a.joinDay));
  const monthStart = Date.UTC(y, m - 1, 1);
  const first = join.getTime() > monthStart && join.getUTCMonth() === m - 1 ? join.getUTCDate() : 1;
  let cand = Array.from({ length: n - first + 1 }, (_, i) => first + i);
  if (cand.length < Math.min(k, 4)) cand = Array.from({ length: n }, (_, i) => i + 1);
  const keyed = cand.map((d) => ({ d, key: -Math.log(Math.max(r(), 1e-12)) / dayWeight(periode, d) })).sort((p1, p2) => p1.key - p2.key);
  const chosen = keyed.slice(0, k).map((x) => x.d).sort((p1, p2) => p1 - p2);
  while (chosen.length < k) chosen.push(chosen[chosen.length - 1] ?? 1); // fewer free days than visits: share days
  return chosen;
}
function visitHour(a: Acc, periode: string, day: number): number {
  const key = `${a.id}|${periode}|${day}`;
  if (!visits.has(key)) visits.set(key, { hour: hourFor(a.torn), min: int(r, 0, 55) });
  return visits.get(key)!.hour;
}
const visitMin = (a: Acc, periode: string, day: number) => visits.get(`${a.id}|${periode}|${day}`)!.min;

for (const periode of PERIODES_SEED) {
  const active: Acc[] = [];
  for (const s of SEGS) {
    const segAccs = accs.filter((a) => a.seg === s);
    const n = s.sub ? segAccs.length : Math.max(MIN_GROUP_SIZE + 1, Math.round(segAccs.length * P_ACTIVE[periode]));
    active.push(...shuffle(r, segAccs).slice(0, Math.min(n, segAccs.length)));
  }
  const count = new Map<Acc, number>(active.map((a) => [a, 1]));
  let extra = PERIOD_TARGET[periode] - active.length;
  const wAcc = (a: Acc) => (a.torn === "nit" ? 0.6 : 1) * (a.manager ? 1.3 : 1);
  while (extra > 0) {
    const keyed = active.map((a) => ({ a, k: -Math.log(Math.max(r(), 1e-12)) / wAcc(a) })).sort((x, y) => x.k - y.k);
    for (const { a } of keyed) {
      if (extra === 0) break;
      if ((count.get(a) ?? 0) < MAX_PER_ACCOUNT) { count.set(a, (count.get(a) ?? 0) + 1); extra--; }
    }
  }
  for (const a of active) {
    const qs = sampleQuestions(a, periode, count.get(a)!);
    const days = LARGE ? activeDays(a, periode, Math.ceil(qs.length / 2)) : [];
    for (const [qi, q] of qs.entries()) {
      // Large: about two answers per active day, same visit (same hour), a few minutes apart.
      const day = LARGE ? days[Math.floor(qi / 2)] : int(r, 1, 28);
      const data = LARGE
        ? `${periode}-${pad(day)} ${pad(visitHour(a, periode, day))}:${pad(Math.min(59, visitMin(a, periode, day) + (qi % 2) * int(r, 1, 3)))}:${pad(int(r, 0, 59))}`
        : `${periode}-${pad(day)} ${pad(hourFor(a.torn))}:${pad(int(r, 0, 59))}:${pad(int(r, 0, 59))}`;
      const x = latent(a.col, q.dom, periode, a.torn, a.manager, q.item.key, a.bias);
      rows.push({ acc: a, q, periode, data, valor: valueFor(q.item.tipus, x), tipus: q.item.tipus });
    }
  }
}
rows.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.acc.id < b.acc.id ? -1 : a.acc.id > b.acc.id ? 1 : a.q.id - b.q.id));

// Comments: committed JSON, never generated here
const cj = JSON.parse(fs.readFileSync(commentsFile, "utf8")) as { comments: { id: string; tema: string; text: string }[] };
const bank = new Map<string, string[]>();
for (const c of cj.comments) (bank.get(c.tema) ?? bank.set(c.tema, []).get(c.tema)!).push(c.text);
// Large profile: comments are built from the template bank per answer, so the wording can follow the answer
// (score sentiment, shift) and does not run out. The small profile keeps reading the committed comments.json.
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const POS_TAILS = ["En això estem bé.", "Ho valoro de manera positiva.", "Ha millorat respecte abans.", "Estic content amb això."];
const NEG_TAILS = ["Ho veig força malament.", "Fa temps que és així.", "Es nota cada setmana.", "Seria urgent canviar-ho.", "Molta gent opina el mateix."];
const SHIFT_TAILS: Record<string, string[]> = {
  nit: ["Sobretot al torn de nit.", "De nit ho notem més."],
  tarda: ["Al torn de tarda és igual.", "A la tarda ho vivim així."],
  mati: ["Al torn de matí també passa."],
};
function sentimentOf(row: Row): -1 | 0 | 1 {
  if (row.valor === null) return 0;
  if (row.tipus === "scale5") return row.valor >= 4 ? 1 : row.valor <= 2 ? -1 : 0;
  if (row.tipus === "scale10") return row.valor >= 7 ? 1 : row.valor <= 4 ? -1 : 0;
  if (row.tipus === "yes_no") return row.valor === 1 ? 1 : -1;
  return 0;
}
function genComment(tema: string, row: Row): string {
  const core = pick(r, CORES[tema]);
  const p = pick(r, PREFIXES), sfx = pick(r, SUFFIXES);
  const body = p ? `${p}${core}` : cap(core);
  let text = `${body}${sfx.startsWith(".") || sfx === "" ? (sfx === "" ? "." : sfx) : "." + sfx}`;
  const sent = sentimentOf(row);
  if (sent !== 0 && chance(r, 0.22)) text += " " + pick(r, sent > 0 ? POS_TAILS : NEG_TAILS);
  if (row.acc.torn && chance(r, 0.1)) text += " " + pick(r, SHIFT_TAILS[row.acc.torn]);
  const noise = r();
  if (noise < 0.06) text = text.replace(/\.$/, ""); // forgot the full stop
  else if (noise < 0.1) text = text.replace(/\.$/, "..."); // trailing off
  else if (noise < 0.13) text = text.charAt(0).toLowerCase() + text.slice(1); // typed in a hurry
  return text;
}
const take = (tema: string, row: Row) => {
  if (LARGE) return genComment(tema, row);
  const t = bank.get(tema)!.shift();
  if (t === undefined) throw new Error(`comments.json is out of '${tema}' comments`);
  return t;
};
const commented = new Set<Row>();
const setComment = (row: Row, tema: string) => { row.tema = tema; row.comentari = take(tema, row); commented.add(row); };

// Special themes first: the October emerging theme (Fàbriques) and the Logística weak signal.
function placeSpecial(tema: string, col: string, perPeriod: Record<string, number>, prefer: (q: Q) => number) {
  for (const [periode, n] of Object.entries(perPeriod)) {
    const cand = rows.filter((x) => x.acc.col === col && x.periode === periode && !commented.has(x));
    const keyed = cand.map((x) => ({ x, k: -Math.log(Math.max(r(), 1e-12)) / prefer(x.q) })).sort((a, b) => a.k - b.k);
    const seenAcc = new Set<string>();
    const chosen: Row[] = [];
    for (const { x } of keyed) { if (!seenAcc.has(x.acc.id)) { seenAcc.add(x.acc.id); chosen.push(x); } if (chosen.length === n) break; }
    for (const { x } of keyed) { if (chosen.length === n) break; if (!chosen.includes(x)) chosen.push(x); }
    chosen.forEach((x) => setComment(x, tema));
  }
}
const prefTorns = (q: Q) => (q.item.key === "torns" || q.item.key === "pauses" || q.item.key === "torns_obert" ? 12 : q.domNom === "Condicions i organització" || q.domNom === "Benestar" ? 3 : 1);
const prefCalor = (q: Q) => (q.item.key === "calor" || q.item.key === "epi" ? 12 : q.domNom === "Benestar" || q.domNom === "Condicions i organització" ? 3 : 1);
// Emerging theme: rare in August, growing in September, dominant in October. Weak signal: always a handful.
const EMERGENT_PER: Record<string, number> = LARGE ? { "2026-10": 260, "2026-09": 30, "2026-08": 6 } : { "2026-10": 40, "2026-09": 4, "2026-08": 2 };
const WEAK_PER: Record<string, number> = LARGE ? { "2026-08": 5, "2026-09": 6, "2026-10": 9 } : { "2026-08": 4, "2026-09": 4, "2026-10": 6 };
const sumOf = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
placeSpecial("torns_comunicacio_pauses", "Fàbriques", EMERGENT_PER, prefTorns);
placeSpecial("seguretat_calor_epi", "Logística", WEAK_PER, prefCalor);

// General comments: every open-question answer, then random scale answers until 500 comments.
const openCount = rows.filter((x) => x.tipus === "open").length;
const specialN = sumOf(EMERGENT_PER) + sumOf(WEAK_PER);
const generalThemes = THEMES.filter((t) => t.kind === "general");
const total = LARGE ? Math.max(Math.round(rows.length * 0.13), openCount + specialN + generalThemes.length * 40) : THEMES.reduce((s, t) => s + t.count, 0);
rows.filter((x) => x.tipus === "open" && !commented.has(x)).forEach((x) => commented.add(x));
const need = total - commented.size;
if (need < 0) throw new Error("More open answers than comments available");
const wRow = (x: Row) => (x.acc.col === "Fàbriques" && x.periode === "2026-10" ? 1.8 : x.acc.col === "Logística" ? 1.3 : 1);
const extraRows = rows
  .filter((x) => !commented.has(x))
  .map((x) => ({ x, k: -Math.log(Math.max(r(), 1e-12)) / wRow(x) }))
  .sort((a, b) => a.k - b.k)
  .slice(0, need)
  .map((e) => e.x);
extraRows.forEach((x) => commented.add(x));

const generalTotal = total - specialN;
const quota = new Map(generalThemes.map((t, i) => [t.id, LARGE ? Math.floor(generalTotal / generalThemes.length) + (i < generalTotal % generalThemes.length ? 1 : 0) : bank.get(t.id)!.length]));
for (const x of shuffle(r, rows.filter((y) => commented.has(y) && !y.tema))) {
  const own = [...quota].filter(([id, n]) => n > 0 && THEMES.find((t) => t.id === id)!.domini === x.q.domNom);
  const pool2 = own.length ? own : [...quota].filter(([, n]) => n > 0);
  const [tema] = pool2.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  quota.set(tema, quota.get(tema)! - 1);
  setComment(x, tema);
}

// Insert responses (+ hidden labels)
const insR = db.prepare(
  "INSERT INTO resposta (compte_id, pregunta_id, valor_num, comentari, canal, periode, data) VALUES (?,?,?,?, 'app', ?, ?)",
);
const insSeed = db.prepare("INSERT INTO resposta_seed (resposta_id, tema_real) VALUES (?,?)");
db.transaction(() => {
  for (const x of rows) {
    const id = Number(insR.run(x.acc.id, x.q.id, x.valor, x.comentari ?? null, x.periode, x.data).lastInsertRowid);
    if (x.tema) insSeed.run(id, x.tema);
  }
})();

// ---- Summary and verification ----------------------------------------------------------
type Rec = Record<string, number | string | null>;
const all = (sql: string) => db.prepare(sql).all() as Rec[];
const one = (sql: string) => db.prepare(sql).get() as Rec;
const line = (s: string) => console.log(s);

line(`DB: ${out}`);
const c = one(`SELECT (SELECT COUNT(*) FROM empleat_sintetic) emp, (SELECT COUNT(*) FROM compte) comptes, (SELECT COUNT(*) FROM pregunta) preg,
  (SELECT COUNT(*) FROM resposta) resp, (SELECT COUNT(*) FROM resposta WHERE comentari IS NOT NULL) coms, (SELECT COUNT(*) FROM resposta_seed) seeds`);
line(`employees=${c.emp} accounts=${c.comptes} questions=${c.preg} responses=${c.resp} comments=${c.coms} seed_labels=${c.seeds}`);

line("\nResponses per collective x period:");
for (const x of all(`SELECT c.nom col, r.periode p, COUNT(*) n FROM resposta r JOIN compte a ON a.id=r.compte_id JOIN collectiu c ON c.id=a.collectiu_id GROUP BY 1,2 ORDER BY 1,2`)) line(`  ${x.col} ${x.p}: ${x.n}`);

const SEG_SQL = `SELECT c.nom col, COALESCE(t.nom,'-') torn, COUNT(DISTINCT a.id) respondents, COUNT(*) responses,
  (SELECT COUNT(*) FROM empleat_sintetic e WHERE e.collectiu_id=a.collectiu_id AND COALESCE(e.torn_id,0)=COALESCE(a.torn_id,0)) pop
  FROM resposta r JOIN compte a ON a.id=r.compte_id JOIN collectiu c ON c.id=a.collectiu_id LEFT JOIN torn t ON t.id=a.torn_id
  GROUP BY a.collectiu_id, a.torn_id ORDER BY a.collectiu_id, a.torn_id`;
line("\nRespondents per segment (collective x shift), all periods:");
for (const x of all(SEG_SQL)) line(`  ${String(x.col).padEnd(10)} ${String(x.torn).padEnd(6)} respondents=${String(x.respondents).padStart(3)} responses=${String(x.responses).padStart(3)} pop=${String(x.pop).padStart(3)} rate=${((Number(x.respondents) / Number(x.pop)) * 100).toFixed(1)}%`);

line("\nRespondents per segment x period (n < " + MIN_GROUP_SIZE + " flagged):");
const perPeriod = all(`SELECT c.nom col, COALESCE(t.nom,'-') torn, r.periode p, COUNT(DISTINCT a.id) n FROM resposta r JOIN compte a ON a.id=r.compte_id
  JOIN collectiu c ON c.id=a.collectiu_id LEFT JOIN torn t ON t.id=a.torn_id GROUP BY a.collectiu_id,a.torn_id,r.periode ORDER BY a.collectiu_id,a.torn_id,r.periode`);
const bySeg = new Map<string, string[]>();
for (const x of perPeriod) (bySeg.get(`${x.col}/${x.torn}`) ?? bySeg.set(`${x.col}/${x.torn}`, []).get(`${x.col}/${x.torn}`)!).push(`${x.p}=${x.n}${Number(x.n) < MIN_GROUP_SIZE ? "*" : ""}`);
for (const [k, v] of bySeg) line(`  ${k.padEnd(18)} ${v.join("  ")}`);

const sub = all(SEG_SQL).filter((x) => Number(x.respondents) < MIN_GROUP_SIZE);
line(`\nSub-threshold segments (collective x shift, n<${MIN_GROUP_SIZE}): ${sub.length} -> ${sub.map((x) => `${x.col}/${x.torn} (n=${x.respondents})`).join(", ")}`);
if (sub.length !== 1) throw new Error("Expected exactly one sub-threshold group");

const mgr = all(`SELECT a.es_manager m, ROUND(AVG(r.valor_num),2) mean, COUNT(*) n FROM resposta r JOIN compte a ON a.id=r.compte_id JOIN pregunta p ON p.id=r.pregunta_id WHERE p.tipus='scale5' GROUP BY 1`);
line(`\nManager bias (scale5 mean): ${mgr.map((x) => `${x.m ? "manager" : "non-manager"}=${x.mean} (n=${x.n})`).join(" vs ")}`);

const torns = all(`SELECT r.periode p, ROUND(AVG(r.valor_num),2) mean, COUNT(*) n FROM resposta r JOIN compte a ON a.id=r.compte_id JOIN pregunta p ON p.id=r.pregunta_id
  WHERE a.collectiu_id=1 AND (p.text LIKE 'El sistema de torns%' OR p.text LIKE 'Les pauses durant%') GROUP BY 1 ORDER BY 1`);
line(`Fàbriques torns/pauses questions, mean by period: ${torns.map((x) => `${x.p}=${x.mean} (n=${x.n})`).join("  ")}`);

const themes = all(`SELECT s.tema_real t, r.periode p, a.collectiu_id col, COUNT(*) n FROM resposta_seed s JOIN resposta r ON r.id=s.resposta_id JOIN compte a ON a.id=r.compte_id
  WHERE s.tema_real IN ('torns_comunicacio_pauses','seguretat_calor_epi') GROUP BY 1,2,3 ORDER BY 1,3,2`);
line(`Hidden theme labels (collectiu 1=Fàbriques, 2=Logística): ${themes.map((x) => `${x.t}/c${x.col}/${x.p}=${x.n}`).join("  ")}`);
const night = all(`SELECT COALESCE(t.nom,'-') torn, ROUND(AVG(1.0*x.n),2) avg_resp FROM (SELECT a.id, a.torn_id, COUNT(*) n FROM resposta r JOIN compte a ON a.id=r.compte_id WHERE a.collectiu_id IN (1,2) GROUP BY a.id) x LEFT JOIN torn t ON t.id=x.torn_id GROUP BY x.torn_id`);
line(`Responses per account (Fàbriques+Logística) by shift: ${night.map((x) => `${x.torn}=${x.avg_resp}`).join("  ")}`);
const leak = one(`SELECT COUNT(*) n FROM resposta r JOIN pregunta p ON p.id=r.pregunta_id JOIN compte a ON a.id=r.compte_id WHERE p.collectiu_id <> a.collectiu_id`);
line(`Responses to a question of another collective: ${leak.n}`);
const report = runEngineJob(db);
console.log("engine job:", JSON.stringify(report));
// Themes, summaries and emergent alarms from the comments (deterministic, no key), then template proposals for open alarms.
const comments = runCommentAnalysisSync(db, { now: Date.now() });
console.log("comment analysis:", JSON.stringify(comments));
runRecommendations(db, { now: Date.now(), draft: templateRecommendations })
  .then((recs) => console.log("recommendations:", JSON.stringify(recs)))
  .finally(() => db.close());
