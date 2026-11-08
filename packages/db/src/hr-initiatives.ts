// HR-side read function for the initiative-to-domain view (R-DOM-5, N-14).
// Lists, per domain, what HR has set in motion (approved recommendations, follow-up surveys, HR needs, sampling probes)
// with the domain score before and after. Aggregates only: the scores come from getTrends(), which re-applies the
// minimum group size and complementary suppression, so a cell under 10 respondents is never a number here.
import type { Lang } from "@damm/shared";
import { getDb } from "./connection";
import { getTrends, listDomains, listNeedCards, listRecommendations, type Trends } from "./hr-repository";

export type InitiativeKind = "recommendation" | "followup" | "need" | "probe";
/** Raw status: recommendation = aprovada; need/follow-up = esborrany | llesta | publicada | tancada; probe = active | ended | stopped. */
export type InitiativeStatus = "aprovada" | "esborrany" | "llesta" | "publicada" | "tancada" | "active" | "ended" | "stopped";

export interface InitiativeReading {
  periode: string;
  /** Mean score 1..5, or null when the cell is suppressed. */
  mitjana: number | null;
  /** Respondents behind the mean; null when suppressed. */
  n: number | null;
}

export interface DomainInitiative {
  kind: InitiativeKind;
  id: number;
  title: string;
  /** Damm initiative a recommendation uses (e.g. "Seguretat i salut"); null otherwise. */
  initiative: string | null;
  status: InitiativeStatus;
  /** Collective the initiative targets; null = whole company. */
  scope: string | null;
  /** When it started (approved, published, probe start), "YYYY-MM-DD"; null when unknown. */
  anchor: string | null;
  /** Domain score in the last readable period before the anchor's period; null when none or suppressed. */
  before: InitiativeReading | null;
  /** Domain score in the latest readable period after the anchor's period; null while there is no later period. */
  after: InitiativeReading | null;
}

export interface DomainInitiatives {
  domini: string;
  items: DomainInitiative[];
}

function readingIn(trends: Trends, scope: string | null, domini: string, idx: number): InitiativeReading | null {
  const row = trends.series.find((s) => s.scope === (scope ?? "Tots"))?.rows.find((r) => r.domini === domini);
  const cell = row?.cells[idx];
  if (!cell || cell.suprimit || cell.mitjana === null || cell.n === null) return null;
  return { periode: trends.periodes[idx], mitjana: cell.mitjana, n: cell.n };
}

/** Before = last readable period strictly before the anchor's month; after = latest readable period strictly after it. */
function beforeAfter(trends: Trends, scope: string | null, domini: string, anchor: string | null) {
  if (!anchor) return { before: null, after: null };
  const month = anchor.slice(0, 7);
  let b = -1;
  let a = -1;
  trends.periodes.forEach((p, i) => {
    if (p < month) b = i;
    if (p > month) a = i;
  });
  return {
    before: b >= 0 ? readingIn(trends, scope, domini, b) : null,
    after: a >= 0 ? readingIn(trends, scope, domini, a) : null,
  };
}

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

/**
 * Every initiative grouped by domain (domains with none are omitted), newest first inside a domain.
 * Reads recommendations, needs, probes and aggregates only: no responses, no accounts.
 */
export function getDomainInitiatives(lang?: Lang): DomainInitiatives[] {
  const db = getDb();
  const trends = getTrends();
  const domains = listDomains();
  const domOfSignal = new Map(
    (db.prepare("SELECT s.id, d.nom AS domini, c.nom AS collectiu FROM senyal s JOIN domini d ON d.id = s.domini_id LEFT JOIN collectiu c ON c.id = s.collectiu_id").all() as {
      id: number; domini: string; collectiu: string | null;
    }[]).map((r) => [r.id, r]),
  );
  const needs = listNeedCards(lang);
  const needById = new Map(needs.map((n) => [n.id, n]));
  const out = new Map<string, DomainInitiative[]>();
  const push = (domini: string, it: Omit<DomainInitiative, "before" | "after">) => {
    const list = out.get(domini) ?? [];
    list.push({ ...it, ...beforeAfter(trends, it.scope, domini, it.anchor) });
    out.set(domini, list);
  };

  const followUpOf = new Set<number>();
  for (const r of listRecommendations(lang)) {
    if (r.estat !== "aprovada") continue;
    const sig = r.senyalId ? domOfSignal.get(r.senyalId) : undefined;
    if (!sig) continue;
    push(sig.domini, {
      kind: "recommendation", id: r.id, title: r.titol ?? r.text, initiative: r.iniciativa ?? null, status: "aprovada",
      scope: sig.collectiu, anchor: day(r.aprovadaEl),
    });
    const need = r.seguimentNecessitatId ? needById.get(r.seguimentNecessitatId) : undefined;
    if (need) {
      followUpOf.add(need.id);
      push(sig.domini, {
        kind: "followup", id: need.id, title: need.titol ?? need.textNl, initiative: null, status: need.state,
        scope: need.collectiu, anchor: day(need.publicat), // a draft follow-up has no start, so no before/after
      });
    }
  }

  for (const n of needs) {
    if (followUpOf.has(n.id)) continue;
    const doms = [...new Set(n.approved.map((q) => q.domini))];
    for (const d of doms) {
      push(d, { kind: "need", id: n.id, title: n.titol ?? n.textNl, initiative: null, status: n.state, scope: n.collectiu, anchor: day(n.publicat) });
    }
  }

  const probes = db
    .prepare(
      `SELECT p.id, d.nom AS domini, c.nom AS collectiu, p.starts_at AS startsAt,
              CASE WHEN p.stopped_at IS NOT NULL THEN 'stopped' WHEN p.ends_at < datetime('now') THEN 'ended' ELSE 'active' END AS status
       FROM probe p JOIN domini d ON d.id = p.domini_id JOIN collectiu c ON c.id = p.collectiu_id ORDER BY p.id DESC`,
    )
    .all() as { id: number; domini: string; collectiu: string; startsAt: string; status: "active" | "ended" | "stopped" }[];
  for (const p of probes) {
    push(p.domini, { kind: "probe", id: p.id, title: "", initiative: null, status: p.status, scope: p.collectiu, anchor: day(p.startsAt) });
  }

  return domains
    .filter((d) => out.has(d.nom))
    .map((d) => ({ domini: d.nom, items: out.get(d.nom)!.sort((a, b) => (b.anchor ?? "").localeCompare(a.anchor ?? "")) }));
}
