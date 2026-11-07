// HR-side data access. The only repository HR routes may import.
// Reads aggregate outputs and the analytics view; never `resposta` or `compte`.
import crypto from "node:crypto";
import type { Agregat, Recomanacio, Senyal } from "@damm/shared";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";
import { classifyChange, complementarySuppression, precisionBand, type Change, type HideReason, type PrecisionBand } from "./hr-rigour";

export interface DraftQuestion {
  id: number;
  domini: string;
  tipus: string;
  text: string;
  necessitatId: number | null;
  generadaPerIa: boolean;
}

export function createNecessitat(input: {
  textNl: string;
  collectiuId: number | null;
  duradaMaxS: number | null;
}): number {
  const r = getDb()
    .prepare("INSERT INTO necessitat (text_nl, collectiu_id, durada_max_s) VALUES (?, ?, ?)")
    .run(input.textNl, input.collectiuId, input.duradaMaxS);
  return Number(r.lastInsertRowid);
}

export function listCollectius(): { id: number; nom: string }[] {
  return getDb().prepare("SELECT id, nom FROM collectiu ORDER BY id").all() as { id: number; nom: string }[];
}

export function listDrafts(): DraftQuestion[] {
  return getDb()
    .prepare(
      `SELECT p.id, d.nom AS domini, p.tipus, p.text, p.necessitat_id AS necessitatId, p.generada_per_ia AS ia
       FROM pregunta p JOIN domini d ON d.id = p.domini_id
       WHERE p.estat = 'draft' ORDER BY p.id`,
    )
    .all()
    .map((r: any) => ({ ...r, generadaPerIa: !!r.ia }));
}

export function updateDraftText(id: number, text: string): void {
  getDb().prepare("UPDATE pregunta SET text = ? WHERE id = ? AND estat = 'draft'").run(text, id);
}

/** Human approval: the only code path that sets estat = 'aprovada'. */
export function approveQuestion(id: number, approvedBy: string): void {
  getDb()
    .prepare(
      `UPDATE pregunta SET estat = 'aprovada', prioritat = CASE WHEN necessitat_id IS NULL THEN prioritat ELSE 100 END,
       aprovada_per = ?, aprovada_el = datetime('now') WHERE id = ? AND estat = 'draft'`,
    )
    .run(approvedBy, id);
}

export function discardQuestion(id: number): void {
  getDb().prepare("UPDATE pregunta SET estat = 'retirada' WHERE id = ? AND estat = 'draft'").run(id);
}

export function listApprovedUnpublishedNeeds(): { id: number; textNl: string; approved: number }[] {
  return getDb()
    .prepare(
      `SELECT n.id, n.text_nl AS textNl, COUNT(p.id) AS approved
       FROM necessitat n JOIN pregunta p ON p.necessitat_id = n.id AND p.estat = 'aprovada'
       WHERE n.estat <> 'publicada' GROUP BY n.id`,
    )
    .all() as { id: number; textNl: string; approved: number }[];
}

/** Publish = approved questions are already in the pool; create the join code and link. */
export function publishNecessitat(necessitatId: number, baseUrl: string) {
  const db = getDb();
  const n = db.prepare("SELECT collectiu_id AS c FROM necessitat WHERE id = ?").get(necessitatId) as { c: number | null } | undefined;
  if (!n) throw new Error("Necessitat not found");
  const codi = crypto.randomBytes(4).toString("hex").toUpperCase();
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO joincode (codi, empresa, collectiu_id) VALUES (?, 'Demo', ?)").run(codi, n.c ?? 1);
    db.prepare("INSERT INTO publicacio (necessitat_id, codi_join, qr_url) VALUES (?, ?, ?)").run(
      necessitatId, codi, `${baseUrl}/join/${codi}`,
    );
    db.prepare("UPDATE necessitat SET estat = 'publicada' WHERE id = ?").run(necessitatId);
  });
  tx();
  return { codi, url: `${baseUrl}/join/${codi}` };
}

export function listPublications() {
  return getDb()
    .prepare(
      `SELECT pu.id, pu.codi_join AS codi, pu.qr_url AS url, n.text_nl AS textNl
       FROM publicacio pu JOIN necessitat n ON n.id = pu.necessitat_id ORDER BY pu.id DESC`,
    )
    .all() as { id: number; codi: string; url: string; textNl: string }[];
}

export interface AggregateRow extends Omit<Agregat, "collectiuId" | "tornId" | "dominiId" | "n" | "mitjana"> {
  collectiu: string | null;
  torn: string | null;
  domini: string | null;
  n: number | null; // null when suppressed
  mitjana: number | null; // null when suppressed
  precisio: PrecisionBand | null;
  motiu: HideReason;
}

/** Suppression is re-enforced on read, whatever the job wrote. Complementary suppression is applied per parent. */
export function listAggregates(): AggregateRow[] {
  const rows = (getDb()
    .prepare(
      `SELECT a.periode, c.nom AS collectiu, t.nom AS torn, d.nom AS domini, a.n, a.mitjana, a.suprimit
       FROM agregat a LEFT JOIN collectiu c ON c.id = a.collectiu_id
       LEFT JOIN torn t ON t.id = a.torn_id LEFT JOIN domini d ON d.id = a.domini_id
       ORDER BY a.periode DESC, c.nom, t.nom, d.nom`,
    )
    .all() as any[]);
  // Siblings: shifts share (periode, collectiu, domini); collectives share (periode, domini). Totals have no siblings.
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const key = r.torn ? `t|${r.periode}|${r.collectiu}|${r.domini}` : r.collectiu ? `c|${r.periode}|${r.domini}` : `x|${i}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const reason: HideReason[] = new Array(rows.length).fill(null);
  for (const idx of groups.values()) {
    const res = complementarySuppression(idx.map((i) => ({ n: rows[i].n, primary: !!rows[i].suprimit })));
    idx.forEach((i, k) => (reason[i] = res[k]));
  }
  return rows.map((r, i) => {
    const hidden = reason[i] !== null;
    return {
      ...r, suprimit: hidden, motiu: reason[i],
      n: hidden ? null : r.n, mitjana: hidden ? null : r.mitjana,
      precisio: hidden ? null : precisionBand(r.n),
    };
  });
}

export function listSignals(): (Omit<Senyal, "collectiuId"> & { collectiu: string | null })[] {
  return (getDb()
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, c.nom AS collectiu, s.periode, s.n, s.confianca, s.suprimit
       FROM senyal s LEFT JOIN collectiu c ON c.id = s.collectiu_id ORDER BY s.n DESC`,
    )
    .all() as any[])
    .filter((r) => r.n >= MIN_GROUP_SIZE && !r.suprimit)
    .map((r) => ({ ...r, suprimit: false }));
}

export function listRecommendations(): Recomanacio[] {
  return getDb()
    .prepare(
      `SELECT id, senyal_id AS senyalId, text, estat, seguiment_necessitat_id AS seguimentNecessitatId
       FROM recomanacio ORDER BY id`,
    )
    .all() as Recomanacio[];
}

export function approveRecommendation(id: number): void {
  getDb().prepare("UPDATE recomanacio SET estat = 'aprovada' WHERE id = ? AND estat = 'proposada'").run(id);
}

export function discardRecommendation(id: number): void {
  getDb().prepare("UPDATE recomanacio SET estat = 'descartada' WHERE id = ? AND estat = 'proposada'").run(id);
}

/** Follow-up survey: a new open need linked to an approved recommendation. Questions come from the AI layer. */
export function createFollowUp(recId: number): number | null {
  const db = getDb();
  const r = db.prepare("SELECT text, estat, seguiment_necessitat_id AS s FROM recomanacio WHERE id = ?").get(recId) as
    | { text: string; estat: string; s: number | null } | undefined;
  if (!r || r.estat !== "aprovada" || r.s) return r?.s ?? null;
  const id = createNecessitat({ textNl: `Seguiment: ${r.text}`, collectiuId: null, duradaMaxS: 60 });
  db.prepare("UPDATE recomanacio SET seguiment_necessitat_id = ? WHERE id = ?").run(id, recId);
  return id;
}

/** Admin view: account counts per collective only. */
export function accountCounts(): { collectiu: string; comptes: number }[] {
  return getDb()
    .prepare(
      `SELECT c.nom AS collectiu, COUNT(k.id) AS comptes FROM collectiu c
       LEFT JOIN compte k ON k.collectiu_id = c.id GROUP BY c.id ORDER BY c.id`,
    )
    .all() as { collectiu: string; comptes: number }[];
}

// --- Results dashboard reads (aggregates + synthetic population only) ------------------

export interface RepRow {
  collectiu: string;
  torn: string | null;
  suprimit: boolean;
  motiu: HideReason;
  respondents: number | null; // null when suppressed
  respShare: number | null; // 0..1, among visible segments of the same group
  popShare: number | null;
  gap: number | null; // respShare - popShare
}

export interface Representativeness {
  periode: string | null;
  collectius: RepRow[];
  torns: RepRow[];
}

interface RepItem { collectiu: string; torn: string | null; resp: number; pop: number; hidden: boolean }

/** Primary hiding (small, flagged, no row or tiny population), then complementary suppression among the siblings. */
function buildRep(items: RepItem[]): RepRow[] {
  const primary = items.map((i) => i.hidden || i.resp < MIN_GROUP_SIZE || i.pop < MIN_GROUP_SIZE);
  const reasons = complementarySuppression(
    items.map((i, k) => ({ n: i.hidden && i.resp === 0 ? null : i.resp, primary: primary[k] })),
  ).map((r, k) => (primary[k] && r === null ? ("primari" as const) : r));
  const visible = items.filter((_, k) => reasons[k] === null);
  const respTotal = visible.reduce((s, i) => s + i.resp, 0);
  const popTotal = visible.reduce((s, i) => s + i.pop, 0);
  return items.map((i, k) => {
    if (reasons[k] !== null) {
      return { collectiu: i.collectiu, torn: i.torn, suprimit: true, motiu: reasons[k], respondents: null, respShare: null, popShare: null, gap: null };
    }
    const respShare = i.resp / respTotal;
    const popShare = i.pop / popTotal;
    return { collectiu: i.collectiu, torn: i.torn, suprimit: false, motiu: null, respondents: i.resp, respShare, popShare, gap: respShare - popShare };
  });
}

/** Response share vs synthetic population share for the latest period. Shares are computed among visible segments only, so suppressed counts cannot be recovered by subtraction. */
export function getRepresentativeness(): Representativeness {
  const db = getDb();
  const p = db.prepare("SELECT MAX(periode) AS p FROM agregat").get() as { p: string | null };
  if (!p.p) return { periode: null, collectius: [], torns: [] };
  const cols = listCollectius();
  const torns = db.prepare("SELECT id, nom FROM torn ORDER BY id").all() as { id: number; nom: string }[];
  const pop = db
    .prepare("SELECT collectiu_id AS c, torn_id AS t, COUNT(*) AS n FROM empleat_sintetic GROUP BY collectiu_id, torn_id")
    .all() as { c: number; t: number | null; n: number }[];
  const resp = db
    .prepare(
      `SELECT collectiu_id AS c, torn_id AS t, n, suprimit FROM agregat
       WHERE periode = ? AND collectiu_id IS NOT NULL AND domini_id IS NULL`,
    )
    .all(p.p) as { c: number; t: number | null; n: number; suprimit: number }[];

  const popC = (c: number) => pop.filter((x) => x.c === c).reduce((s, x) => s + x.n, 0);
  const collectius = buildRep(
    cols.map((c) => {
      const r = resp.find((x) => x.c === c.id && x.t === null);
      return { collectiu: c.nom, torn: null, resp: r?.n ?? 0, pop: popC(c.id), hidden: !r || !!r.suprimit };
    }),
  );

  const shiftRows: RepRow[] = [];
  for (const c of cols) {
    const shifts = torns.filter((t) => pop.some((x) => x.c === c.id && x.t === t.id));
    if (!shifts.length) continue;
    shiftRows.push(
      ...buildRep(
        shifts.map((t) => {
          const r = resp.find((x) => x.c === c.id && x.t === t.id);
          const n = pop.find((x) => x.c === c.id && x.t === t.id)?.n ?? 0;
          return { collectiu: c.nom, torn: t.nom, resp: r?.n ?? 0, pop: n, hidden: !r || !!r.suprimit };
        }),
      ),
    );
  }
  return { periode: p.p, collectius, torns: shiftRows };
}

export interface TrendCell {
  mitjana: number | null;
  n: number | null; // null when suppressed
  precisio: PrecisionBand | null;
  suprimit: boolean;
  motiu: HideReason;
}
export interface TrendRow { domini: string; cells: TrendCell[]; canvi: Change }
export interface TrendSeries {
  scope: string; // "Tots" or a collective name
  rows: TrendRow[];
}
export interface Trends { periodes: string[]; series: TrendSeries[] }

/** Mean score per domain per period, overall and per collective. Suppression re-enforced on read, including complementary suppression of collectives under "Tots". */
export function getTrends(): Trends {
  const db = getDb();
  const periodes = (db.prepare("SELECT DISTINCT periode FROM agregat ORDER BY periode").all() as { periode: string }[]).map((r) => r.periode);
  const doms = db.prepare("SELECT id, nom FROM domini ORDER BY id").all() as { id: number; nom: string }[];
  const rows = db
    .prepare(
      `SELECT periode, collectiu_id AS c, domini_id AS d, n, mitjana, suprimit FROM agregat
       WHERE torn_id IS NULL AND domini_id IS NOT NULL`,
    )
    .all() as { periode: string; c: number | null; d: number; n: number; mitjana: number | null; suprimit: number }[];
  const cols = listCollectius();
  const scopes: { id: number | null; nom: string }[] = [{ id: null, nom: "Tots" }, ...cols.map((c) => ({ id: c.id, nom: c.nom }))];
  const find = (per: string, c: number | null, d: number) => rows.find((x) => x.periode === per && x.c === c && x.d === d);

  // reason[scope id|"all"][periode][domini]
  const reasonOf = new Map<string, HideReason>();
  for (const per of periodes) {
    for (const d of doms) {
      const total = find(per, null, d.id);
      if (total) reasonOf.set(`${per}|null|${d.id}`, total.n < MIN_GROUP_SIZE || total.suprimit ? "primari" : null);
      const present = cols.filter((c) => find(per, c.id, d.id));
      const res = complementarySuppression(present.map((c) => {
        const r = find(per, c.id, d.id)!;
        return { n: r.n, primary: !!r.suprimit };
      }));
      present.forEach((c, k) => reasonOf.set(`${per}|${c.id}|${d.id}`, res[k]));
    }
  }

  const series = scopes
    .map((s) => {
      const trendRows = doms.map((d): TrendRow => {
        const cells = periodes.map((per): TrendCell => {
          const r = find(per, s.id, d.id);
          if (!r) return { mitjana: null, n: null, precisio: null, suprimit: false, motiu: null };
          const motiu = reasonOf.get(`${per}|${s.id}|${d.id}`) ?? null;
          if (motiu) return { mitjana: null, n: null, precisio: null, suprimit: true, motiu };
          return { mitjana: r.mitjana, n: r.n, precisio: precisionBand(r.n), suprimit: false, motiu: null };
        });
        const last = cells.length - 1;
        return { domini: d.nom, cells, canvi: classifyChange(cells[last - 1], cells[last]) };
      });
      return { scope: s.nom, rows: trendRows };
    })
    .filter((s) => s.rows.some((r) => r.cells.some((c) => c.mitjana !== null || c.suprimit)));
  return { periodes, series };
}

export interface ThemeRow {
  id: number;
  etiqueta: string | null; // null when suppressed
  resum: string | null;
  periode: string;
  n: number | null;
  emergent: boolean;
  suprimit: boolean;
}

export function listThemes(): ThemeRow[] {
  return (getDb()
    .prepare("SELECT id, etiqueta, resum, periode, n, emergent, suprimit FROM tema ORDER BY periode DESC, emergent DESC, n DESC")
    .all() as any[]).map((r) => {
    const hidden = r.n < MIN_GROUP_SIZE || !!r.suprimit;
    return {
      id: r.id, periode: r.periode, emergent: !!r.emergent, suprimit: hidden,
      etiqueta: hidden ? null : r.etiqueta, resum: hidden ? null : r.resum, n: hidden ? null : r.n,
    };
  });
}

// --- CSV export (aggregates only; same suppression as the results page) ----------------

function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the aggregates behind the results page. Suppressed segments carry no numbers and `suprimit=1`. */
export function exportResultsCsv(): string {
  const header = ["tipus", "periode", "collectiu", "torn", "domini", "respondents", "resp_pct", "pop_pct", "diferencia_pp", "mitjana", "suprimit", "n", "precisio", "canvi"];
  const lines: (string | number | null)[][] = [header];
  const pct = (v: number | null) => (v === null ? null : +(v * 100).toFixed(1));

  const rep = getRepresentativeness();
  for (const [tipus, rows] of [["representativitat_collectiu", rep.collectius], ["representativitat_torn", rep.torns]] as const) {
    for (const r of rows) {
      const hide = r.suprimit;
      lines.push([
        tipus, rep.periode, r.collectiu, r.torn, null,
        hide ? null : r.respondents, hide ? null : pct(r.respShare), hide ? null : pct(r.popShare), hide ? null : pct(r.gap),
        null, hide ? 1 : 0, hide ? null : r.respondents, null, null,
      ]);
    }
  }

  const trends = getTrends();
  for (const s of trends.series) {
    for (const row of s.rows) {
      row.cells.forEach((c, i) => {
        const hide = c.suprimit || c.mitjana === null;
        if (!c.suprimit && c.mitjana === null) return; // no data for this cell
        const last = i === row.cells.length - 1;
        lines.push([
          "tendencia", trends.periodes[i], s.scope, null, row.domini, null, null, null, null,
          hide ? null : +c.mitjana!.toFixed(2), hide ? 1 : 0, hide ? null : c.n, hide ? null : c.precisio, last && !hide ? row.canvi.label : null,
        ]);
      });
    }
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// --- HR home overview (aggregates, counts and synthetic population only) ----------------

export interface PendingItem {
  kind: "draft" | "recomanacio";
  id: number;
  text: string;
}

export interface HrOverview {
  periode: string | null;
  population: number;
  respondents: number | null; // sum of visible collective segments in the latest period
  participation: number | null; // 0..1
  openNeeds: number;
  pendingDrafts: number;
  pendingRecommendations: number;
  signalCount: number;
  topSignals: ReturnType<typeof listSignals>;
  pending: PendingItem[];
}

/** Everything the HR home screen shows. Segments under the minimum group size never enter a sum. */
export function getHrOverview(): HrOverview {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  const population = count("SELECT COUNT(*) AS c FROM empleat_sintetic");
  const p = db.prepare("SELECT MAX(periode) AS p FROM agregat").get() as { p: string | null };
  let respondents: number | null = null;
  if (p.p) {
    const rows = db
      .prepare(
        `SELECT n, suprimit FROM agregat
         WHERE periode = ? AND collectiu_id IS NOT NULL AND torn_id IS NULL AND domini_id IS NULL`,
      )
      .all(p.p) as { n: number; suprimit: number }[];
    const hide = complementarySuppression(rows.map((r) => ({ n: r.n, primary: !!r.suprimit })));
    const visible = rows.filter((_, k) => hide[k] === null);
    respondents = visible.length ? visible.reduce((s, r) => s + r.n, 0) : null;
  }
  const signals = listSignals();
  const drafts = listDrafts();
  const recs = listRecommendations().filter((r) => r.estat === "proposada");
  return {
    periode: p.p,
    population,
    respondents,
    participation: respondents !== null && population > 0 ? respondents / population : null,
    openNeeds: count("SELECT COUNT(*) AS c FROM necessitat WHERE estat = 'oberta'"),
    pendingDrafts: drafts.length,
    pendingRecommendations: recs.length,
    signalCount: signals.length,
    topSignals: signals.slice(0, 3),
    pending: [
      ...drafts.map((d): PendingItem => ({ kind: "draft", id: d.id, text: d.text })),
      ...recs.map((r): PendingItem => ({ kind: "recomanacio", id: r.id, text: r.text })),
    ],
  };
}
