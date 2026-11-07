// Data assembly for the insights-first HR pages. Reads only HR-safe aggregates:
// @damm/db/hr (trends, representativeness, themes, recommendations) and the engine's insight read API.
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getRepresentativeness, getTrends, listRecommendations, listThemes, type TrendCell } from "@damm/db/hr";
import { hrInsights, type InsightView } from "@/lib/hr-engine";
import { fixShifts } from "@/lib/format";

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v)}%`;

export const COMPANY = "Tots";

export const segHref = (collective: string | null, domain: string | null) => {
  const p = new URLSearchParams();
  if (collective && collective !== "All" && collective !== COMPANY) p.set("seg", collective);
  if (domain) p.set("dom", domain);
  const q = p.toString();
  return `/hr/results${q ? `?${q}` : ""}#tendencia`;
};

// ---------- narrative ----------

export type NarrativeView = Extract<InsightView, { kind: "narrative" }>;

/** Latest non-suppressed engine narrative for a collective ("All" = company-wide), or null. */
export function getNarrative(collective: string = "All"): NarrativeView | null {
  const rows = hrInsights({ role: "hr" }, { kind: "narrative" }).filter(
    (i): i is NarrativeView => i.kind === "narrative" && !i.suppressed && !!i.detail && i.detail.labels.collective === collective,
  );
  rows.sort((a, b) => b.periode.localeCompare(a.periode) || b.id - a.id);
  return rows[0] ?? null;
}

// ---------- proposals ----------

export function getProposals() {
  return listRecommendations().filter((r) => r.estat === "proposada");
}

// ---------- headlines ----------

export type Headline = {
  key: string;
  tone: "up" | "down" | "warn" | "neutral";
  text: string;
  n: number;
  confidence: number | null;
  href: string;
};

function headlineOf(i: InsightView): (Headline & { rank: number }) | null {
  if (i.suppressed || !i.detail) return null;
  const where = (l: { collective: string; domain: string | null; shift: string | null }) =>
    `${l.domain ?? "El clima"} ${l.collective === "All" ? "a tota l'empresa" : `a ${l.collective}`}${l.shift ? ` (${fixShifts(l.shift)})` : ""}`;
  const base = { key: `${i.kind}-${i.id}`, n: i.n };
  switch (i.kind) {
    case "top_mover": {
      const d = i.detail;
      const up = d.direction === "up";
      return {
        ...base,
        tone: up ? "up" : "down",
        text: `${where(d.labels)} ${up ? "puja" : "baixa"} ${f1(Math.abs(d.delta))} punts (de ${f1(d.previous.score)} a ${f1(d.current.score)} sobre 10).`,
        confidence: d.current.confidence,
        href: segHref(d.labels.collective, d.labels.domain),
        rank: 100 + Math.abs(d.delta) * (d.current.confidence / 100) * 10 + (up ? 0 : 5),
      };
    }
    case "polarisation": {
      const d = i.detail;
      return {
        ...base,
        tone: "warn",
        text: `${where(d.labels)}: les opinions s'allunyen (el consens baixa ${Math.round(d.consensusDrop)} punts, ara ${pct(d.current.consensus)}).`,
        confidence: d.current.confidence,
        href: segHref(d.labels.collective, d.labels.domain),
        rank: 80 + d.consensusDrop / 5,
      };
    }
    case "importance_gap": {
      const d = i.detail;
      if (d.quadrant !== "act_first") return null;
      return {
        ...base,
        tone: "down",
        text: `${where(d.labels)} és important per a la plantilla (${pct(d.importance * 100)}) però puntua només ${f1(d.score)}/10: actua-hi primer.`,
        confidence: null,
        href: segHref(d.labels.collective, d.labels.domain),
        rank: 90 + d.priority * 10,
      };
    }
    case "segment_gap": {
      const d = i.detail;
      if (d.dimension === "shift") {
        return {
          ...base,
          tone: "warn",
          text: `${where(d.labels)}: ${fixShifts(d.lowest.label ?? "un torn")} puntua ${f1(d.gap)} punts per sota de ${fixShifts(d.highest.label ?? "un altre torn")} (${f1(d.lowest.score)} davant ${f1(d.highest.score)}).`,
          confidence: null,
          href: segHref(d.labels.collective, d.labels.domain),
          rank: 60 + d.gap * 5,
        };
      }
      return {
        ...base,
        tone: "warn",
        text: `${where(d.labels)}: els responsables puntuen ${f1(Math.abs(d.gap))} punts ${d.gap >= 0 ? "per sobre" : "per sota"} de la resta. Pot ser un biaix de positivitat.`,
        confidence: null,
        href: segHref(d.labels.collective, d.labels.domain),
        rank: 50 + Math.abs(d.gap) * 5,
      };
    }
    default:
      return null;
  }
}

/** 3 to 5 plain-language headlines, one best per kind first so the strip is varied. */
export function getHeadlines(): Headline[] {
  const kinds = ["top_mover", "polarisation", "importance_gap", "segment_gap"] as const;
  const all = hrInsights({ role: "hr" }, { kind: [...kinds] })
    .map(headlineOf)
    .filter((h): h is Headline & { rank: number } => h !== null)
    .sort((a, b) => b.rank - a.rank);
  const picked: (Headline & { rank: number })[] = [];
  const seenKinds = new Set<string>();
  for (const h of all) {
    const kind = h.key.split("-")[0];
    if (!seenKinds.has(kind) && picked.length < 5) {
      picked.push(h);
      seenKinds.add(kind);
    }
  }
  for (const h of all) if (picked.length < 5 && !picked.includes(h)) picked.push(h);
  return picked
    .sort((a, b) => b.rank - a.rank)
    .map((h) => ({ key: h.key, tone: h.tone, text: h.text, n: h.n, confidence: h.confidence, href: h.href }));
}

// ---------- heatmap ----------

export type HeatCell = {
  collective: string;
  domain: string;
  mean: number | null;
  /** mean minus the company mean for that domain, on the 1..5 scale */
  delta: number | null;
  n: number | null;
  precision: TrendCell["precisio"];
  suppressed: boolean;
  reason: string | null;
};

export type Heatmap = {
  periode: string | null;
  domains: string[];
  collectives: string[];
  company: (number | null)[];
  cells: HeatCell[][]; // [collective][domain]
  maxAbs: number;
};

export function getHeatmap(t: ReturnType<typeof getTrends> = getTrends()): Heatmap {
  const [overall, ...rest] = t.series;
  const last = t.periodes.length - 1;
  if (!overall || last < 0) return { periode: null, domains: [], collectives: [], company: [], cells: [], maxAbs: 0.5 };
  const domains = overall.rows.map((r) => r.domini);
  const company = overall.rows.map((r) => r.cells[last]?.mitjana ?? null);
  let maxAbs = 0.3;
  const cells = rest.map((s) => {
    const byDomain = new Map(s.rows.map((r) => [r.domini, r.cells[last]]));
    return domains.map((domain, di): HeatCell => {
      const c = byDomain.get(domain);
      const mean = c?.mitjana ?? null;
      const ref = company[di];
      const delta = mean !== null && ref !== null ? mean - ref : null;
      if (delta !== null) maxAbs = Math.max(maxAbs, Math.abs(delta));
      return {
        collective: s.scope,
        domain,
        mean,
        delta,
        n: c?.n ?? null,
        precision: c?.precisio ?? null,
        suppressed: !!c?.suprimit || (!!c && c.mitjana === null),
        reason: c?.motiu ?? null,
      };
    });
  });
  return { periode: t.periodes[last], domains, collectives: rest.map((s) => s.scope), company, cells, maxAbs };
}

export type SegmentTrend = {
  scope: string;
  domain: string;
  periodes: string[];
  cells: TrendCell[];
  canvi: ReturnType<typeof getTrends>["series"][number]["rows"][number]["canvi"];
} | null;

export function getSegmentTrend(seg: string | undefined, dom: string | undefined): SegmentTrend {
  if (!dom) return null;
  const t = getTrends();
  const s = t.series.find((x) => x.scope === (seg ?? COMPANY));
  const row = s?.rows.find((r) => r.domini === dom);
  if (!s || !row) return null;
  return { scope: s.scope, domain: dom, periodes: t.periodes, cells: row.cells, canvi: row.canvi };
}

// ---------- themes next to domains ----------

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  Benestar: ["benestar", "estr", "salut", "calor", "seguretat", "descans", "pausa", "fatiga", "ergon", "equip de protecci", "epi"],
  Lideratge: ["lideratge", "responsable", "cap ", "comunicaci", "feedback", "direcci", "confian"],
  Desenvolupament: ["desenvolup", "formaci", "carrera", "aprendre", "promoci", "creixement"],
  "Cultura i pertinença": ["cultura", "pertinen", "valors", "orgull", "equip", "inclusi"],
  "Entorn i relacions": ["relaci", "companys", "entorn", "ambient", "col·labor", "conflicte"],
  "Condicions i organització": ["torn", "horari", "càrrega", "organitz", "sou", "salari", "condicions", "vacances", "descans"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFC");

function domainOf(text: string, domains: string[]): string | null {
  const t = norm(text);
  let best: string | null = null;
  let hits = 0;
  for (const d of domains) {
    const kws = DOMAIN_KEYWORDS[d] ?? [norm(d)];
    const h = kws.filter((k) => t.includes(norm(k))).length;
    if (h > hits) {
      hits = h;
      best = d;
    }
  }
  return best;
}

export type ThemeCard = {
  label: string;
  summary: string | null;
  isNew: boolean;
  weak: boolean;
  latestN: number;
  /** share of that period's visible comments, one per period, oldest first; null where the theme was absent */
  shares: (number | null)[];
  periodes: string[];
};

export type ThemesByDomain = { domain: string | null; themes: ThemeCard[] }[];

export function getThemesByDomain(domains: string[]): ThemesByDomain {
  const rows = listThemes().filter((t) => !t.suprimit && t.etiqueta);
  const periodes = [...new Set(rows.map((t) => t.periode))].sort();
  const totals = new Map(periodes.map((p) => [p, rows.filter((t) => t.periode === p).reduce((a, t) => a + (t.n ?? 0), 0)]));
  const byLabel = new Map<string, typeof rows>();
  for (const t of rows) byLabel.set(t.etiqueta!, [...(byLabel.get(t.etiqueta!) ?? []), t]);
  const latest = periodes[periodes.length - 1];
  const cards: (ThemeCard & { domain: string | null })[] = [];
  for (const [label, list] of byLabel) {
    const lastRow = list.find((t) => t.periode === latest) ?? list[list.length - 1];
    if (lastRow.periode !== latest) continue; // not seen this period
    const shares = periodes.map((p) => {
      const r = list.find((t) => t.periode === p);
      const tot = totals.get(p) ?? 0;
      return r && r.n !== null && tot > 0 ? r.n / tot : null;
    });
    const n = lastRow.n ?? 0;
    cards.push({
      domain: domainOf(`${label} ${lastRow.resum ?? ""}`, domains),
      label,
      summary: lastRow.resum,
      isNew: list.some((t) => t.emergent) || list.length === 1,
      weak: n < MIN_GROUP_SIZE * 2 && !list.some((t) => t.emergent),
      latestN: n,
      shares,
      periodes,
    });
  }
  const order = [...domains, null];
  return order
    .map((d) => ({ domain: d, themes: cards.filter((c) => c.domain === d).sort((a, b) => b.latestN - a.latestN) }))
    .filter((g) => g.themes.length > 0);
}

// ---------- who to reach ----------

export type ReachGap = { key: string; text: string; action: string; pp: number };

export function getReachGaps(limit = 4): ReachGap[] {
  const rep = getRepresentativeness();
  const gaps: ReachGap[] = [];
  const add = (label: string, kind: "col·lectiu" | "torn", r: { respShare: number | null; popShare: number | null; gap: number | null; suprimit: boolean }) => {
    if (r.suprimit || r.gap === null || r.respShare === null || r.popShare === null) return;
    const pp = Math.round(r.gap * 100);
    if (pp > -4) return;
    gaps.push({
      key: `${kind}-${label}`,
      pp,
      text: `${kind === "torn" ? `El torn ${label}` : label} aporta el ${Math.round(r.respShare * 100)}% de les respostes però és el ${Math.round(r.popShare * 100)}% de la plantilla (${pp} pp).`,
      action:
        kind === "torn"
          ? `Envia les preguntes a l'hora del torn ${label} i reforça el recordatori abans del canvi de torn.`
          : `Demana a ${label} que comparteixi l'enllaç d'invitació i prova un recordatori curt.`,
    });
  };
  for (const r of rep.collectius) add(r.collectiu, "col·lectiu", r);
  for (const r of rep.torns) if (r.torn) add(r.torn, "torn", r);
  return gaps.sort((a, b) => a.pp - b.pp).slice(0, limit);
}
