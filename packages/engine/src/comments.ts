// Comment analysis (docs/engine.md section 12). Groups the redacted open comments into themes, summarises each
// theme per period and collective, and opens an `emergent` alarm when a theme grows against the previous period.
//
// Deterministic by default (lexicon, Catalan/Spanish/English). An LLM can be injected for classification and
// summaries (packages/ai); the engine itself has no LLM or network dependency, like `createEngine({ db, redact })`.
// Reads comments through the analytics view `v_resposta_analitica` (no account id). Writes `tema`, `comentari_tema`
// and `senyal`. Segments below the minimum group size are suppressed: no summary, no comment links, no alarm.
import { DEFAULT_CONFIG, resolveConfig, type EngineConfig } from "./config.ts";
import { all, one, run, transaction, type SqlDatabase } from "./db.ts";
import { THEMES, THEME_BY_KEY, type ThemeDef } from "./comments-lexicon.ts";
import { dayOf, toMs, toSqlDatetime } from "./time.ts";

export { THEMES } from "./comments-lexicon.ts";
export type { ThemeDef } from "./comments-lexicon.ts";

// ---- Classification (pure) --------------------------------------------------------------------------------------

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[·]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Entry = { kind: "stem" | "exact" | "phrase"; text: string; weight: number };

const compiled = new Map<string, Entry[]>();
for (const th of THEMES) {
  compiled.set(
    th.key,
    th.lexicon.map((raw): Entry => {
      const strong = raw.startsWith("+");
      const triple = raw.startsWith("++");
      const body = raw.replace(/^\++/, "");
      const exact = body.trim().endsWith("=");
      const text = normalizeText(body.replace(/=$/, ""));
      const kind = exact ? "exact" : text.includes(" ") ? "phrase" : "stem";
      return { kind, text, weight: triple ? 3 : strong ? 2 : 1 };
    }),
  );
}

function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function entryHits(e: Entry, tokens: string[], padded: string): boolean {
  if (e.kind === "exact") return tokens.includes(e.text);
  if (e.kind === "phrase") return padded.includes(` ${e.text}`);
  for (const t of tokens) {
    if (t.startsWith(e.text)) return true;
    if (e.text.length >= 8 && t.length >= e.text.length - 1 && (within1(t.slice(0, e.text.length), e.text) || within1(t.slice(0, e.text.length + 1), e.text))) return true;
  }
  return false;
}

export interface ThemeMatch {
  key: string;
  /** 0..1, grows with the amount of evidence. */
  confidence: number;
}

/** Themes of one comment: every theme with evidence at least half as strong as the best one, at most three. */
export function classifyComment(text: string): ThemeMatch[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  const tokens = norm.split(" ");
  const padded = ` ${norm} `;
  const scored: { key: string; score: number }[] = [];
  for (const th of [...THEMES].reverse()) { // later themes are more specific and win ties
    let score = 0;
    for (const e of compiled.get(th.key)!) if (entryHits(e, tokens, padded)) score += e.weight;
    if (score > 0) scored.push({ key: th.key, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  return scored
    .filter((s) => s.score * 2 > top)
    .slice(0, 3)
    .map((s) => ({ key: s.key, confidence: Math.round((s.score / (s.score + 1.5)) * 100) / 100 }));
}

// ---- Options and report -----------------------------------------------------------------------------------------

export interface CommentThemeInput {
  /** Local index within the call; never the response id. */
  id: number;
  text: string;
}

export interface SummaryInput {
  theme: string;
  themeKey: string;
  periode: string;
  collective: string | null;
  n: number;
  share: number;
  prevShare: number | null;
  emergent: boolean;
  /** Other themes that often appear in the same comments. */
  coThemes: string[];
  /** Up to eight redacted comments of the group (n >= minGroupSize), for the LLM to summarise. Never to be quoted. */
  sample: string[];
}

export interface CommentOptions {
  now: number;
  config?: Partial<EngineConfig>;
  thresholds?: Partial<CommentThresholds>;
  /** Optional LLM classifier: theme keys per comment (keys from THEMES). Missing comments fall back to the lexicon. */
  classify?: (comments: CommentThemeInput[], themes: { key: string; label: string }[]) => Promise<Map<number, string[]> | Record<number, string[]> | null>;
  /** Optional LLM summary (Catalan, no quotes). Null or a throw falls back to the template. */
  summarise?: (input: SummaryInput) => Promise<string | null>;
  /** Cap on LLM summary calls per run (emergent and latest period first). Default 40. */
  maxSummaries?: number;
}

export interface CommentThresholds {
  /** emergent: the theme's share of the collective's comments rose at least this much (0..1) vs. the previous period. */
  emergentTrigger: number;
  emergentClear: number;
  cooldownDays: number;
  /** emergent: the theme needs at least this many comments in the period (well above the minimum group size of 10). */
  emergentMinCount: number;
  /** emergent: both periods need at least this many comments in the collective, so a share is meaningful. */
  emergentMinBase: number;
  /** emergent: two-proportion z-score the rise must reach (2.58 = p < 0.01; many themes x collectives are screened). */
  emergentZ: number;
}

export const COMMENT_DEFAULTS: CommentThresholds = {
  emergentTrigger: 0.1,
  emergentClear: 0.05,
  cooldownDays: 7,
  emergentMinCount: 15,
  emergentMinBase: 40,
  emergentZ: 2.58,
};

/** Two-proportion z-score of x1/n1 against x2/n2 (pooled variance). Positive = the first share is higher. */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

export interface CommentReport {
  comments: number;
  themed: number;
  unthemed: number;
  rows: number;
  suppressed: number;
  emergentOpened: number;
  emergentResolved: number;
  llmClassified: number;
  llmSummaries: number;
  source: "rules" | "llm";
}

// ---- Data -------------------------------------------------------------------------------------------------------

interface CommentRow {
  id: number;
  collectiu_id: number;
  periode: string;
  comentari: string;
}

interface Group {
  key: string;
  periode: string;
  collectiuId: number | null;
  base: number;
  count: number;
  ids: number[];
  conf: Map<number, number>;
}

interface PlannedRow {
  theme: ThemeDef;
  periode: string;
  collectiuId: number | null;
  collective: string | null;
  n: number;
  base: number;
  share: number;
  prevShare: number | null;
  suppressed: boolean;
  emergent: boolean;
  prevBase: number;
  prevCount: number;
  resum: string | null;
  font: "rules" | "llm";
  ids: number[];
  conf: Map<number, number>;
  coThemes: string[];
  sample: string[];
}

/** Adds the columns this module needs to databases created before they existed. */
export function ensureThemeColumns(db: SqlDatabase): void {
  const cols = new Set(all<{ name: string }>(db, "SELECT name FROM pragma_table_info('tema')").map((c) => c.name));
  if (!cols.has("collectiu_id")) db.exec("ALTER TABLE tema ADD COLUMN collectiu_id INTEGER REFERENCES collectiu(id)");
  if (!cols.has("clau")) db.exec("ALTER TABLE tema ADD COLUMN clau TEXT");
  if (!cols.has("share")) db.exec("ALTER TABLE tema ADD COLUMN share REAL");
  if (!cols.has("font")) db.exec("ALTER TABLE tema ADD COLUMN font TEXT NOT NULL DEFAULT 'seed'");
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SENSITIVE_SUMMARY =
  "Hi ha comentaris sobre aquest tema. Per protegir les persones només es mostra el recompte agregat; si cal, cal adreçar-se al canal confidencial oficial.";

/** Template summary in Catalan. Aggregate only: it never quotes or paraphrases a comment. */
export function templateSummary(x: Omit<SummaryInput, "sample">): string {
  const who = x.collective ? `a ${x.collective}` : "a tota l'empresa";
  const parts = [`${x.n} comentaris (${pct(x.share)} dels comentaris ${who} aquest període) parlen de «${x.theme}».`];
  if (x.prevShare !== null) {
    const d = Math.round((x.share - x.prevShare) * 100);
    if (x.emergent) parts.push(`Tema emergent: puja ${d} punts percentuals respecte al període anterior.`);
    else if (d >= 3) parts.push(`Creix ${d} punts respecte al període anterior.`);
    else if (d <= -3) parts.push(`Baixa ${-d} punts respecte al període anterior.`);
    else parts.push("Es manté estable respecte al període anterior.");
  } else parts.push("No hi ha període anterior comparable.");
  if (x.coThemes.length) parts.push(`Sovint apareix juntament amb: ${x.coThemes.map((t) => `«${t}»`).join(", ")}.`);
  parts.push("Resum automàtic a partir de recomptes; no reprodueix cap comentari.");
  return parts.join(" ");
}

/** The LLM text must not copy a run of words from a source comment. */
export function copiesComment(summary: string, sample: string[], run = 5): boolean {
  const s = normalizeText(summary).split(" ");
  const grams = new Set<string>();
  for (let i = 0; i + run <= s.length; i++) grams.add(s.slice(i, i + run).join(" "));
  for (const c of sample) {
    const w = normalizeText(c).split(" ");
    for (let i = 0; i + run <= w.length; i++) if (grams.has(w.slice(i, i + run).join(" "))) return true;
  }
  return false;
}

interface Plan {
  rows: PlannedRow[];
  periods: string[];
  total: number;
  themed: number;
  cfg: EngineConfig;
  collectives: Map<number, string>;
  domains: Map<string, number>;
}

function loadComments(db: SqlDatabase, nowPeriod: string): CommentRow[] {
  return all<CommentRow>(
    db,
    `SELECT id, collectiu_id, periode, comentari FROM v_resposta_analitica
     WHERE comentari IS NOT NULL AND TRIM(comentari) <> '' AND periode <= ? ORDER BY periode, id`,
    nowPeriod,
  );
}

/** Pure planning step: assignments in, rows (counts, shares, flags, template summaries) out. */
function plan(db: SqlDatabase, rows: CommentRow[], assign: Map<number, ThemeMatch[]>, cfg: EngineConfig, t: CommentThresholds): Plan {
  const minN = cfg.minGroupSize ?? DEFAULT_CONFIG.minGroupSize;
  const collectives = new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM collectiu").map((c) => [c.id, c.nom]));
  const domains = new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM domini").map((d) => [d.nom, d.id]));
  const periods = [...new Set(rows.map((r) => r.periode))].sort();

  const base = new Map<string, number>(); // `${periode}|${collectiu or ''}`
  const groups = new Map<string, Group>(); // `${periode}|${collectiu or ''}|${theme}`
  const pair = new Map<string, number>(); // co-occurrence within a group
  const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  let themed = 0;
  for (const r of rows) {
    const ms = assign.get(r.id) ?? [];
    if (ms.length) themed++;
    for (const scope of [r.collectiu_id, null]) {
      bump(base, `${r.periode}|${scope ?? ""}`);
      for (const m of ms) {
        const gk = `${r.periode}|${scope ?? ""}|${m.key}`;
        let g = groups.get(gk);
        if (!g) groups.set(gk, (g = { key: m.key, periode: r.periode, collectiuId: scope, base: 0, count: 0, ids: [], conf: new Map() }));
        g.count++;
        g.ids.push(r.id);
        g.conf.set(r.id, m.confidence);
        for (const o of ms) if (o.key !== m.key) bump(pair, `${gk}>${o.key}`);
      }
    }
  }

  const out: PlannedRow[] = [];
  const byKey = new Map<string, PlannedRow>();
  const sampleOf = new Map(rows.map((r) => [r.id, r.comentari]));
  for (const g of groups.values()) {
    const theme = THEME_BY_KEY.get(g.key)!;
    const b = base.get(`${g.periode}|${g.collectiuId ?? ""}`) ?? 0;
    const suppressed = g.count < minN || b < minN;
    const pi = periods.indexOf(g.periode);
    const prevP = pi > 0 ? periods[pi - 1]! : null;
    const prevBase = prevP ? base.get(`${prevP}|${g.collectiuId ?? ""}`) ?? 0 : 0;
    const prevCount = prevP ? groups.get(`${prevP}|${g.collectiuId ?? ""}|${g.key}`)?.count ?? 0 : 0;
    const prevShare = prevP && prevBase >= minN ? prevCount / prevBase : null;
    const coThemes = suppressed
      ? []
      : [...pair].filter(([k]) => k.startsWith(`${g.periode}|${g.collectiuId ?? ""}|${g.key}>`)).sort((a, b2) => b2[1] - a[1]).slice(0, 2).filter(([, c]) => c >= minN).map(([k]) => THEME_BY_KEY.get(k.split(">")[1]!)!.label);
    const row: PlannedRow = {
      theme, periode: g.periode, collectiuId: g.collectiuId, collective: g.collectiuId === null ? null : collectives.get(g.collectiuId) ?? null,
      n: g.count, base: b, share: b ? g.count / b : 0, prevShare, prevBase, prevCount, suppressed, emergent: false, resum: null, font: "rules",
      ids: g.ids, conf: g.conf, coThemes, sample: suppressed || theme.sensitive ? [] : g.ids.slice(0, 8).map((id) => sampleOf.get(id)!),
    };
    out.push(row);
    byKey.set(`${g.periode}|${g.collectiuId ?? ""}|${g.key}`, row);
  }
  out.sort((a, b2) => a.periode.localeCompare(b2.periode) || (a.collectiuId ?? 99) - (b2.collectiuId ?? 99) || b2.n - a.n);

  // Emerging: the share rose enough, both groups have at least minN comments, the theme itself is shown.
  for (const r of out) {
    r.emergent =
      !r.suppressed &&
      !r.theme.sensitive &&
      r.prevShare !== null &&
      r.n >= t.emergentMinCount &&
      r.base >= t.emergentMinBase &&
      r.prevBase >= t.emergentMinBase &&
      r.share - r.prevShare >= t.emergentTrigger &&
      twoProportionZ(r.n, r.base, r.prevCount, r.prevBase) >= t.emergentZ;
  }
  for (const r of out) {
    r.resum = r.suppressed
      ? null
      : r.theme.sensitive
        ? SENSITIVE_SUMMARY
        : templateSummary({ theme: r.theme.label, themeKey: r.theme.key, periode: r.periode, collective: r.collective, n: r.n, share: r.share, prevShare: r.prevShare, emergent: r.emergent, coThemes: r.coThemes });
  }
  return { rows: out, periods, total: rows.length, themed, cfg, collectives, domains };
}

const ACTIVE = new Set(["open", "acknowledged", "action_linked"]);

/** Writes tema, comentari_tema and the emergent alarms. Returns the report fields it owns. */
function write(db: SqlDatabase, p: Plan, opts: CommentOptions, t: CommentThresholds, rep: CommentReport) {
  const nowSql = toSqlDatetime(opts.now);
  const minN = p.cfg.minGroupSize ?? DEFAULT_CONFIG.minGroupSize;
  const latest = p.periods[p.periods.length - 1];
  transaction(db, () => {
    run(db, "DELETE FROM comentari_tema");
    run(db, "DELETE FROM tema");
    const insT = db.prepare(
      "INSERT INTO tema (etiqueta, resum, periode, n, emergent, suprimit, collectiu_id, clau, share, font) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    const insL = db.prepare("INSERT INTO comentari_tema (resposta_id, tema_id, confianca) VALUES (?,?,?)");
    for (const r of p.rows) {
      const id = Number(insT.run(r.theme.label, r.resum, r.periode, r.n, r.emergent ? 1 : 0, r.suppressed ? 1 : 0, r.collectiuId, r.theme.key, r.suppressed ? null : r.share, r.font).lastInsertRowid);
      // Links only for shown, non-sensitive, per-collective rows: HR drill-downs read comments through them.
      if (!r.suppressed && !r.theme.sensitive && r.collectiuId !== null) for (const rid of r.ids) insL.run(rid, id, r.conf.get(rid) ?? 0.5);
      if (r.suppressed) rep.suppressed++;
    }
    rep.rows = p.rows.length;

    // Emergent alarms, same pattern as alarms.ts: trigger and clear levels, cooldown, humans own acknowledged ones.
    const existing = all<{ id: number; collectiu_id: number | null; descripcio: string; status: string; created_at: string; suprimit: number }>(
      db,
      "SELECT id, collectiu_id, descripcio, status, created_at, suprimit FROM senyal WHERE tipus = 'emergent' ORDER BY created_at, id",
    );
    const latestBy = new Map<string, (typeof existing)[number]>();
    const activeBy = new Map<string, (typeof existing)[number]>();
    const keyOf = (c: number | null, label: string) => `${c}|${label}`;
    for (const s of existing) {
      for (const th of THEMES) {
        if (!s.descripcio.startsWith(th.label)) continue;
        latestBy.set(keyOf(s.collectiu_id, th.label), s);
        if (ACTIVE.has(s.status)) activeBy.set(keyOf(s.collectiu_id, th.label), s);
      }
    }
    const ins = db.prepare(
      `INSERT INTO senyal (tipus, descripcio, collectiu_id, torn_id, domini_id, periode, n, confianca, severity, status, audience, created_at, suprimit)
       VALUES ('emergent',?,?,NULL,?,?,?,?, 'warning','open','hr',?,0)`,
    );
    for (const r of p.rows) {
      if (r.collectiuId === null || r.theme.sensitive || r.periode !== latest) continue;
      const k = keyOf(r.collectiuId, r.theme.label);
      const act = activeBy.get(k);
      if (r.suppressed || r.prevShare === null) {
        if (!act || act.status !== "open" || !r.suppressed) continue;
        if (r.base < minN) {
          if (!act.suprimit) run(db, "UPDATE senyal SET suprimit = 1, confianca = NULL WHERE id = ?", act.id); // group too small to say anything
        } else {
          run(db, "UPDATE senyal SET status = 'resolved' WHERE id = ?", act.id); // the theme faded below the minimum count
          rep.emergentResolved++;
        }
        continue;
      }
      const rise = r.share - r.prevShare;
      const desc = `${r.theme.label}: tema emergent a ${r.collective}. Ha passat a ser el ${pct(r.share)} dels comentaris (+${Math.round(rise * 100)} punts respecte al període anterior, ${r.n} comentaris).`;
      const conf = Math.min(1, Math.round((0.5 + Math.min(rise, 0.4)) * 100) / 100);
      if (act) {
        if (act.status !== "open") continue;
        // A seeded placeholder (not written by this module) is adopted: the engine's own wording and numbers replace it.
        if (!act.descripcio.includes(": tema emergent a ") && r.emergent)
          run(db, "UPDATE senyal SET descripcio = ?, periode = ?, n = ?, confianca = ?, severity = 'warning', domini_id = ? WHERE id = ?", desc, r.periode, r.n, conf, r.theme.domain ? p.domains.get(r.theme.domain) ?? null : null, act.id);
        if (act.suprimit) run(db, "UPDATE senyal SET suprimit = 0 WHERE id = ?", act.id);
        if (rise < t.emergentClear) {
          run(db, "UPDATE senyal SET status = 'resolved' WHERE id = ?", act.id);
          rep.emergentResolved++;
        }
        continue;
      }
      if (!r.emergent) continue;
      const last = latestBy.get(k);
      if (last && toMs(nowSql) - toMs(last.created_at) < t.cooldownDays * 86_400_000) continue;
      ins.run(desc, r.collectiuId, r.theme.domain ? p.domains.get(r.theme.domain) ?? null : null, r.periode, r.n, conf, nowSql);
      rep.emergentOpened++;
    }
  });
}

function resolveAll(db: SqlDatabase, opts: CommentOptions) {
  const cfg = resolveConfig(db, opts.config);
  const t: CommentThresholds = { ...COMMENT_DEFAULTS, ...opts.thresholds };
  const nowPeriod = dayOf(opts.now, cfg.timezone).slice(0, 7);
  ensureThemeColumns(db);
  const rows = loadComments(db, nowPeriod);
  const rep: CommentReport = { comments: rows.length, themed: 0, unthemed: 0, rows: 0, suppressed: 0, emergentOpened: 0, emergentResolved: 0, llmClassified: 0, llmSummaries: 0, source: "rules" };
  return { cfg, t, rows, rep };
}

function rulesAssign(rows: CommentRow[]): Map<number, ThemeMatch[]> {
  return new Map(rows.map((r) => [r.id, classifyComment(r.comentari)]));
}

/** Deterministic analysis, synchronous (no LLM). Safe to call from synchronous builders and tests. */
export function runCommentAnalysisSync(db: SqlDatabase, opts: { now: number; config?: Partial<EngineConfig>; thresholds?: Partial<CommentThresholds> }): CommentReport {
  const { cfg, t, rows, rep } = resolveAll(db, opts);
  const p = plan(db, rows, rulesAssign(rows), cfg, t);
  rep.themed = p.themed;
  rep.unthemed = p.total - p.themed;
  write(db, p, opts, t, rep);
  return rep;
}

/**
 * Comment analysis with optional injected LLM functions. Without them (or when they fail) it is identical to
 * `runCommentAnalysisSync`. A failed or invalid LLM answer for a comment or a summary falls back to the rules.
 */
export async function runCommentAnalysis(db: SqlDatabase, opts: CommentOptions): Promise<CommentReport> {
  const { cfg, t, rows, rep } = resolveAll(db, opts);
  const assign = rulesAssign(rows);

  if (opts.classify && rows.length) {
    const themes = THEMES.map((x) => ({ key: x.key, label: x.label }));
    const BATCH = 40;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      let res: Awaited<ReturnType<NonNullable<CommentOptions["classify"]>>> = null;
      try {
        res = await opts.classify(chunk.map((r, j) => ({ id: j, text: r.comentari })), themes);
      } catch {
        res = null; // the lexicon result stays
      }
      if (!res) continue;
      const get = (j: number): string[] | undefined => (res instanceof Map ? res.get(j) : (res as Record<number, string[]>)[j]);
      chunk.forEach((r, j) => {
        const keys = (get(j) ?? []).filter((k) => THEME_BY_KEY.has(k)).slice(0, 3);
        if (keys.length) {
          assign.set(r.id, keys.map((key, n) => ({ key, confidence: Math.round((0.85 - 0.1 * n) * 100) / 100 })));
          rep.llmClassified++;
        }
      });
    }
  }

  const p = plan(db, rows, assign, cfg, t);
  rep.themed = p.themed;
  rep.unthemed = p.total - p.themed;

  if (opts.summarise) {
    const order = p.rows.filter((r) => !r.suppressed && !r.theme.sensitive).sort((a, b) => Number(b.emergent) - Number(a.emergent) || b.periode.localeCompare(a.periode) || b.n - a.n);
    for (const r of order.slice(0, opts.maxSummaries ?? 40)) {
      try {
        const text = await opts.summarise({
          theme: r.theme.label, themeKey: r.theme.key, periode: r.periode, collective: r.collective, n: r.n, share: r.share, prevShare: r.prevShare,
          emergent: r.emergent, coThemes: r.coThemes, sample: r.sample,
        });
        const clean = text?.trim();
        if (clean && clean.length <= 600 && !copiesComment(clean, r.sample)) {
          r.resum = clean;
          r.font = "llm";
          rep.llmSummaries++;
        }
      } catch {
        /* keep the template */
      }
    }
  }
  if (rep.llmClassified > 0 || rep.llmSummaries > 0) rep.source = "llm";
  write(db, p, opts, t, rep);
  return rep;
}

/** For tests and the eval script: share of rows that carry a theme per key. */
export function themeKeys(): string[] {
  return THEMES.map((x) => x.key);
}

export function openEmergent(db: SqlDatabase): number {
  return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM senyal WHERE tipus = 'emergent' AND status = 'open'")?.n ?? 0;
}
