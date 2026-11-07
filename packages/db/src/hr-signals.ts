// HR-side read functions for the signal drilldown page (task 16).
// Aggregates, analysis outputs and the analytics view only; no account ids, no per-person rows.
// Every figure re-applies the minimum group size on read.
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getDb } from "./connection";
import { RECOMMENDATION_COLUMNS, getShiftTrend, getTrends, type TrendCell } from "./hr-repository";
import type { Change } from "./hr-rigour";

// Snippets: stored redacted text only, no metadata returned next to them, never from themes under the minimum size.
const SNIPPETS_PER_THEME = 3;
const SNIPPET_MAX_CHARS = 280;

export interface SignalHeader {
  id: number;
  tipus: string;
  descripcio: string;
  collectiu: string | null;
  collectiuId: number | null;
  tornId: number | null;
  dominiId: number | null;
  domini: string | null;
  torn: string | null;
  periode: string;
  n: number;
  confianca: number | null;
  severity: string | null;
  status: string | null;
}

export interface SignalTrendRow {
  domini: string;
  related: boolean; // the signal description mentions this domain
  cells: (TrendCell & { periode: string })[]; // rigour layer: complementary suppression, n, precisio
  canvi: Change;
}

export interface SignalTheme {
  id: number;
  etiqueta: string;
  resum: string | null;
  emergent: boolean;
  n: number; // comments of this theme within the signal's collective (>= MIN_GROUP_SIZE)
  snippets: string[];
}

export interface SignalRecommendation {
  id: number;
  text: string;
  estat: string;
  seguimentNecessitatId: number | null;
  /** Drafted proposal fields (C11); null on older rows. */
  titol: string | null;
  iniciativa: string | null;
  responsableSuggerit: string | null;
  terminiSuggerit: string | null;
  justificacio: string | null;
  limits: string | null;
  font: "llm" | "template" | null;
  aprovadaEl: string | null;
}


export interface SignalFollowUp {
  necessitatId: number;
  textNl: string;
  estat: string; // oberta | publicada | tancada
  published: boolean;
  questions: { id: number; text: string; estat: string }[];
  newResults: { n: number | null; mitjana: number | null } | null; // null = fewer than MIN_GROUP_SIZE answers so far
}

export type StepState = "done" | "pending";
export interface SignalTimelineStep {
  key: "senyal" | "recomanacio" | "seguiment" | "resultats";
  label: string;
  detail: string;
  state: StepState;
}

export interface SignalDetail {
  signal: SignalHeader;
  periodes: string[];
  trend: SignalTrendRow[];
  trendScope: string; // segment the trend plots, e.g. "Fàbriques · mati" (same as the headline's)
  themes: SignalTheme[];
  hiddenThemes: number; // themes related to the collective but under the minimum group size
  recommendations: SignalRecommendation[];
  followUps: SignalFollowUp[];
  timeline: SignalTimelineStep[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** One signal with its trend, themes, recommendations and follow-up. Null when missing or under the minimum group size (same filter as listSignals). */
export function getSignalDetail(id: number): SignalDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id, s.tipus, s.descripcio, s.collectiu_id AS collectiuId, s.torn_id AS tornId, s.domini_id AS dominiId, c.nom AS collectiu,
              d.nom AS domini, t.nom AS torn,
              s.periode, s.n, s.confianca, s.suprimit, s.severity, s.status
       FROM senyal s
       LEFT JOIN collectiu c ON c.id = s.collectiu_id
       LEFT JOIN domini d ON d.id = s.domini_id
       LEFT JOIN torn t ON t.id = s.torn_id
       WHERE s.id = ?`,
    )
    .get(id) as (SignalHeader & { suprimit: number }) | undefined;
  if (!row || row.n < MIN_GROUP_SIZE || row.suprimit) return null;
  const { suprimit: _s, ...signal } = row;

  // --- Trend: the rigour trend (complementary suppression, precision, change rule) for the signal's scope.
  const all = getTrends();
  const periodes = all.periodes;
  // The signal's own segment: the shift inside its collective when it has one, else the collective (or everyone).
  const shiftTrend = signal.collectiuId !== null && signal.tornId !== null ? getShiftTrend(signal.collectiuId, signal.tornId) : null;
  const scope = shiftTrend ?? all.series.find((x) => x.scope === (signal.collectiu ?? "Tots"));
  const trendScope = [signal.collectiu ?? "Tots", shiftTrend ? signal.torn : null].filter(Boolean).join(" · ");
  const desc = norm(signal.descripcio);
  const trend: SignalTrendRow[] = (scope?.rows ?? [])
    .map((r) => ({
      domini: r.domini,
      related: signal.domini ? norm(signal.domini) === norm(r.domini) : desc.includes(norm(r.domini)),
      cells: r.cells.map((c, i) => ({ ...c, periode: periodes[i] })),
      canvi: r.canvi,
    }))
    .sort((a, b) => Number(b.related) - Number(a.related));

  // --- Themes: counted within the signal's collective through the analytics view.
  const themeRows = db
    .prepare(
      `SELECT t.id, t.etiqueta, t.resum, t.emergent, t.n AS tn, t.suprimit AS ts,
              (SELECT COUNT(*) FROM comentari_tema ct JOIN v_resposta_analitica v ON v.id = ct.resposta_id
                WHERE ct.tema_id = t.id AND (? IS NULL OR v.collectiu_id = ?)) AS cn
       FROM tema t WHERE t.periode = ? ORDER BY t.emergent DESC, t.n DESC`,
    )
    .all(signal.collectiuId, signal.collectiuId, signal.periode) as {
      id: number; etiqueta: string; resum: string | null; emergent: number; tn: number; ts: number; cn: number;
    }[];
  const themes: SignalTheme[] = [];
  let hiddenThemes = 0;
  for (const t of themeRows) {
    if (t.cn === 0) continue; // unrelated to this collective
    if (t.cn < MIN_GROUP_SIZE || t.tn < MIN_GROUP_SIZE || t.ts) { hiddenThemes++; continue; }
    const snippets = (db
      .prepare(
        `SELECT v.comentari AS c FROM comentari_tema ct JOIN v_resposta_analitica v ON v.id = ct.resposta_id
         WHERE ct.tema_id = ? AND (? IS NULL OR v.collectiu_id = ?) AND v.comentari IS NOT NULL AND TRIM(v.comentari) <> ''
         ORDER BY ct.confianca DESC, v.id LIMIT ?`,
      )
      .all(t.id, signal.collectiuId, signal.collectiuId, SNIPPETS_PER_THEME) as { c: string }[])
      .map((r) => (r.c.length > SNIPPET_MAX_CHARS ? `${r.c.slice(0, SNIPPET_MAX_CHARS - 1)}…` : r.c));
    themes.push({ id: t.id, etiqueta: t.etiqueta, resum: t.resum, emergent: !!t.emergent, n: t.cn, snippets });
  }

  // --- Recommendations and follow-up needs.
  const recommendations = db
    .prepare(
      `SELECT ${RECOMMENDATION_COLUMNS} FROM recomanacio WHERE senyal_id = ? ORDER BY id`,
    )
    .all(id) as SignalRecommendation[];

  const followUps: SignalFollowUp[] = [];
  for (const r of recommendations) {
    if (!r.seguimentNecessitatId) continue;
    const need = db.prepare("SELECT id, text_nl AS textNl, estat FROM necessitat WHERE id = ?").get(r.seguimentNecessitatId) as
      | { id: number; textNl: string; estat: string } | undefined;
    if (!need) continue;
    const questions = db
      .prepare("SELECT id, text, estat FROM pregunta WHERE necessitat_id = ? AND estat <> 'retirada' ORDER BY id")
      .all(need.id) as { id: number; text: string; estat: string }[];
    const published = need.estat === "publicada" || !!db.prepare("SELECT 1 FROM publicacio WHERE necessitat_id = ?").get(need.id);
    let newResults: SignalFollowUp["newResults"] = null;
    if (questions.length) {
      const marks = questions.map(() => "?").join(",");
      const agg = db
        .prepare(`SELECT COUNT(*) AS n, AVG(valor_num) AS m FROM v_resposta_analitica WHERE pregunta_id IN (${marks})`)
        .get(...questions.map((q) => q.id)) as { n: number; m: number | null };
      // TODO: count distinct respondents, not answers. v_resposta_analitica has no person key and HR code may not
      // join accounts, so this needs a distinct-respondent column in the view or a precomputed aggregate (Natan).
      if (agg.n >= MIN_GROUP_SIZE) newResults = { n: agg.n, mitjana: agg.m };
    }
    followUps.push({ necessitatId: need.id, textNl: need.textNl, estat: need.estat, published, questions, newResults });
  }

  // --- Timeline: signal -> recommendation -> follow-up need -> new results.
  const approved = recommendations.filter((r) => r.estat === "aprovada").length;
  const timeline: SignalTimelineStep[] = [
    { key: "senyal", label: "Senyal", detail: `Detectat ${signal.periode}`, state: "done" },
    {
      key: "recomanacio", label: "Recomanació",
      detail: approved ? `${approved} aprovada${approved > 1 ? "es" : ""}` : recommendations.length ? "Pendent de decisió" : "Sense recomanació",
      state: approved ? "done" : "pending",
    },
    {
      key: "seguiment", label: "Enquesta de seguiment",
      detail: followUps.some((f) => f.published) ? "Publicada" : followUps.length ? "Creada, sense publicar" : "Per crear",
      state: followUps.length ? "done" : "pending",
    },
    {
      key: "resultats", label: "Nous resultats",
      detail: followUps.some((f) => f.newResults) ? "Disponibles" : `Cal n ≥ ${MIN_GROUP_SIZE}`,
      state: followUps.some((f) => f.newResults) ? "done" : "pending",
    },
  ];

  return { signal, periodes, trend, trendScope, themes, hiddenThemes, recommendations, followUps, timeline };
}

export interface RecommendationDetail {
  recommendation: SignalRecommendation & { creat: string };
  /** The signal that triggered it. Null when the recommendation has none, or the signal is under the minimum group size. */
  signal: SignalDetail | null;
  /** Other recommendations drafted for the same signal. */
  siblings: SignalRecommendation[];
  followUp: SignalFollowUp | null;
}

/** One recommendation with everything around it: originating signal (trend, themes), siblings and follow-up survey. Null when missing. */
export function getRecommendationDetail(id: number): RecommendationDetail | null {
  const row = getDb()
    .prepare(`SELECT senyal_id AS senyalId, creat, ${RECOMMENDATION_COLUMNS} FROM recomanacio WHERE id = ?`)
    .get(id) as (SignalRecommendation & { creat: string; senyalId: number | null }) | undefined;
  if (!row) return null;
  const { senyalId, ...recommendation } = row;
  const signal = senyalId ? getSignalDetail(senyalId) : null;
  return {
    recommendation,
    signal,
    siblings: (signal?.recommendations ?? []).filter((r) => r.id !== id),
    followUp: signal?.followUps.find((f) => f.necessitatId === row.seguimentNecessitatId) ?? null,
  };
}
