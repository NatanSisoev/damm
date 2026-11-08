// HR comment browser (themes and redacted comments). Reads the analytics view and the theme tables only:
// no account id, no username, no timestamp finer than the period. Everything below the minimum group size is hidden.
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { getDb } from "./connection";
import { readingPeriod } from "./hr-repository";

export const COMMENTS_PAGE_SIZE = 25;
const MAX_QUERY_CHARS = 80;

/** Counts per cell: below the minimum group size a cell is null; if exactly one cell of a partition is hidden,
 *  the smallest visible one is hidden too, so a total minus the visible cells cannot reveal the hidden count. */
function suppressCells<T extends { n: number | null }>(cells: T[]): T[] {
  const out = cells.map((c) => ({ ...c, n: c.n !== null && c.n < MIN_GROUP_SIZE ? null : c.n }));
  const hidden = out.filter((c) => c.n === null).length;
  if (hidden === 1) {
    const visible = out.filter((c) => c.n !== null);
    if (visible.length > 0) {
      const smallest = visible.reduce((a, b) => ((a.n as number) <= (b.n as number) ? a : b));
      smallest.n = null;
    }
  }
  return out;
}

/**
 * Theme text in the UI language. Single seam for translations: it reads `traduccio` (entitat 'tema', camps etiqueta and resum)
 * and falls back to the Catalan source when the table or a row is missing. After merging jan/demo-db, replace the body with
 * `overlayTranslations(db, "tema", rows, { etiqueta: "etiqueta", resum: "resum" }, lang)` from ./hr-i18n (same semantics).
 */
function overlayThemeText<T extends { id: number; etiqueta: string; resum: string | null }>(db: ReturnType<typeof getDb>, rows: T[], lang?: Lang): T[] {
  if (!lang || lang === "ca" || rows.length === 0) return rows;
  let found: { entitat_id: number; camp: string; text: string }[];
  try {
    found = db.prepare("SELECT entitat_id, camp, text FROM traduccio WHERE entitat = 'tema' AND lang = ?").all(lang) as typeof found;
  } catch {
    return rows; // table not there yet
  }
  const by = new Map(found.map((f) => [`${f.entitat_id}:${f.camp}`, f.text]));
  for (const r of rows) {
    r.etiqueta = by.get(`${r.id}:etiqueta`) ?? r.etiqueta;
    if (r.resum != null) r.resum = by.get(`${r.id}:resum`) ?? r.resum;
  }
  return rows;
}

export interface ThemeCount { label: string; n: number | null }

export interface CommentTheme {
  /** Stable theme key (tema.clau). */
  key: string;
  /** Catalan label as stored by the analysis job. */
  etiqueta: string;
  resum: string | null;
  /** Comments of this theme in the reading window. Always >= MIN_GROUP_SIZE here. */
  n: number;
  emergent: boolean;
  /** Comments per period (null = fewer than MIN_GROUP_SIZE or complementary-suppressed). */
  periods: { periode: string; n: number | null }[];
  collectives: ThemeCount[];
  domains: ThemeCount[];
}

export interface CommentThemes {
  periodes: string[];
  themes: CommentTheme[];
  /** Themes with fewer than MIN_GROUP_SIZE comments: counted, never named. */
  hiddenThemes: number;
  /** All comments in the reading window (null when below the minimum group size). */
  total: number | null;
}

type Row = Record<string, any>;

/**
 * Themes with counts, a trend across periods and the collectives and domains each touches.
 * Counts are comments (the analytics view carries no account id, so distinct people cannot be counted here).
 */
export function getCommentThemes(lang?: Lang): CommentThemes {
  const db = getDb();
  const last = readingPeriod(db) ?? "";
  const periodes = (db.prepare("SELECT DISTINCT periode FROM v_resposta_analitica WHERE periode <= ? ORDER BY periode").all(last) as Row[]).map((r) => r.periode as string);

  // One row per theme key x period x collective x domain, counted through the analytics view.
  const cells = db.prepare(
    `SELECT t.clau AS key, v.periode AS periode, c.nom AS collectiu, d.nom AS domini, COUNT(*) AS n
     FROM comentari_tema ct
     JOIN tema t ON t.id = ct.tema_id
     JOIN v_resposta_analitica v ON v.id = ct.resposta_id
     LEFT JOIN collectiu c ON c.id = v.collectiu_id
     LEFT JOIN domini d ON d.id = v.domini_id
     WHERE t.clau IS NOT NULL AND v.periode <= ? AND TRIM(COALESCE(v.comentari, '')) <> ''
     GROUP BY t.clau, v.periode, c.nom, d.nom`,
  ).all(last) as { key: string; periode: string; collectiu: string | null; domini: string | null; n: number }[];

  const meta = db.prepare(
    `SELECT id, clau AS key, etiqueta, resum, emergent, periode, collectiu_id FROM tema
     WHERE clau IS NOT NULL AND periode <= ? AND suprimit = 0 AND n >= ? ORDER BY periode DESC, (collectiu_id IS NULL) DESC`,
  ).all(last, MIN_GROUP_SIZE) as { id: number; key: string; etiqueta: string; resum: string | null; emergent: number; periode: string; collectiu_id: number | null }[];

  // One translated row per theme key (the newest, company-wide when present).
  const rep = new Map<string, (typeof meta)[number]>();
  for (const m of meta) if (!rep.has(m.key)) rep.set(m.key, m);
  overlayThemeText(db, [...rep.values()], lang);

  const byKey = new Map<string, typeof cells>();
  for (const c of cells) (byKey.get(c.key) ?? byKey.set(c.key, []).get(c.key)!).push(c);

  const themes: CommentTheme[] = [];
  let hiddenThemes = 0;
  for (const [key, rows] of byKey) {
    const n = rows.reduce((s, r) => s + r.n, 0);
    const m = rep.get(key);
    if (n < MIN_GROUP_SIZE || !m) { hiddenThemes++; continue; }
    const sum = (pick: (r: (typeof rows)[number]) => string | null) => {
      const acc = new Map<string, number>();
      for (const r of rows) { const k = pick(r); if (k !== null) acc.set(k, (acc.get(k) ?? 0) + r.n); }
      return acc;
    };
    const byPeriod = sum((r) => r.periode);
    const periods = suppressCells(periodes.map((p) => ({ periode: p, n: byPeriod.get(p) ?? 0 })));
    const part = (acc: Map<string, number>): ThemeCount[] =>
      suppressCells([...acc].map(([label, cnt]) => ({ label, n: cnt as number | null }))).sort((a, b) => (b.n ?? -1) - (a.n ?? -1) || a.label.localeCompare(b.label));
    const latestEmergent = meta.filter((x) => x.key === key && x.periode === m.periode).some((x) => x.emergent);
    themes.push({
      key, etiqueta: m.etiqueta, resum: m.resum, n, emergent: latestEmergent,
      periods, collectives: part(sum((r) => r.collectiu)), domains: part(sum((r) => r.domini)),
    });
  }
  themes.sort((a, b) => Number(b.emergent) - Number(a.emergent) || b.n - a.n);

  const total = (db.prepare("SELECT COUNT(*) AS n FROM v_resposta_analitica WHERE periode <= ? AND TRIM(COALESCE(comentari, '')) <> ''").get(last) as Row).n as number;
  return { periodes, themes, hiddenThemes, total: total >= MIN_GROUP_SIZE ? total : null };
}

export interface CommentFilters {
  themeKey?: string | null;
  collectiuId?: number | null;
  dominiId?: number | null;
  periode?: string | null;
  q?: string | null;
}

export interface CommentItem {
  /** Redacted text. */
  text: string;
  /** Tags are dropped when the combination (collective, domain, period) has fewer than MIN_GROUP_SIZE comments. */
  periode: string | null;
  collectiu: string | null;
  domini: string | null;
  /** Theme labels of this comment. */
  themes: string[];
}

export interface CommentPage {
  /** Number of matching comments; null when the filter combination is below the minimum group size. */
  n: number | null;
  suppressed: boolean;
  page: number;
  pages: number;
  comments: CommentItem[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Redacted comments for a filter combination. Fewer than MIN_GROUP_SIZE matches: no text and no count. */
export function searchComments(f: CommentFilters, page = 1, lang?: Lang): CommentPage {
  const db = getDb();
  const last = readingPeriod(db) ?? "";
  const q = (f.q ?? "").trim().slice(0, MAX_QUERY_CHARS);
  const where =
    `TRIM(COALESCE(v.comentari, '')) <> '' AND v.periode <= @last
     AND (@col IS NULL OR v.collectiu_id = @col) AND (@dom IS NULL OR v.domini_id = @dom) AND (@per IS NULL OR v.periode = @per)
     AND (@theme IS NULL OR EXISTS (SELECT 1 FROM comentari_tema ct JOIN tema t ON t.id = ct.tema_id WHERE ct.resposta_id = v.id AND t.clau = @theme))`;
  const args = { last, col: f.collectiuId ?? null, dom: f.dominiId ?? null, per: f.periode ?? null, theme: f.themeKey ?? null };
  // Deterministic shuffle, so the order carries neither time nor submission sequence.
  const order = "ORDER BY (v.id * 7919) % 1000003, v.id";

  let total: number;
  let slice: Row[];
  const offset = (Math.max(1, Math.floor(page)) - 1) * COMMENTS_PAGE_SIZE;
  const cols = "v.id AS id, v.comentari AS text, v.periode AS periode, v.collectiu_id AS col, v.domini_id AS dom";
  if (q) {
    const needle = fold(q);
    const all = (db.prepare(`SELECT ${cols} FROM v_resposta_analitica v WHERE ${where} ${order}`).all(args) as Row[]).filter((r) => fold(r.text).includes(needle));
    total = all.length;
    slice = all.slice(offset, offset + COMMENTS_PAGE_SIZE);
  } else {
    total = (db.prepare(`SELECT COUNT(*) AS n FROM v_resposta_analitica v WHERE ${where}`).get(args) as Row).n;
    slice = db.prepare(`SELECT ${cols} FROM v_resposta_analitica v WHERE ${where} ${order} LIMIT ${COMMENTS_PAGE_SIZE} OFFSET ${offset}`).all(args) as Row[];
  }
  if (total < MIN_GROUP_SIZE) return { n: null, suppressed: true, page: 1, pages: 1, comments: [] };

  const pages = Math.max(1, Math.ceil(total / COMMENTS_PAGE_SIZE));
  const names = (table: string) => new Map((db.prepare(`SELECT id, nom FROM ${table}`).all() as Row[]).map((r) => [r.id as number, r.nom as string]));
  const cn = names("collectiu");
  const dn = names("domini");
  const themeOf = db.prepare(
    `SELECT t.id AS id, t.etiqueta AS etiqueta, t.resum AS resum FROM comentari_tema ct JOIN tema t ON t.id = ct.tema_id WHERE ct.resposta_id = ? ORDER BY ct.confianca DESC`,
  );
  const tupleN = db.prepare(
    `SELECT COUNT(*) AS n FROM v_resposta_analitica v WHERE TRIM(COALESCE(v.comentari, '')) <> '' AND v.periode <= ?
       AND v.collectiu_id IS ? AND (? IS NULL OR v.domini_id = ?) AND (? IS NULL OR v.periode = ?)`,
  );
  const cache = new Map<string, number>();
  const big = (col: number | null, dom: number | null, per: string | null) => {
    const k = `${col}|${dom}|${per}`;
    if (!cache.has(k)) cache.set(k, (tupleN.get(last, col, dom, dom, per, per) as Row).n);
    return (cache.get(k) as number) >= MIN_GROUP_SIZE;
  };

  const comments: CommentItem[] = slice.map((r) => {
    const showAll = big(r.col, r.dom, r.periode);
    const showCol = showAll || big(r.col, null, null);
    return {
      text: r.text as string,
      periode: showAll || big(null, null, r.periode) ? r.periode : null,
      collectiu: showCol ? cn.get(r.col) ?? null : null,
      domini: showAll ? dn.get(r.dom) ?? null : null,
      themes: overlayThemeText(db, themeOf.all(r.id) as { id: number; etiqueta: string; resum: string | null }[], lang).map((x) => x.etiqueta),
    };
  });
  return { n: total, suppressed: false, page: Math.min(Math.max(1, Math.floor(page)), pages), pages, comments };
}
