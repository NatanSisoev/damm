// Recommendation proposals for open alarms (docs/engine.md section 12). Runs as a job, never in a request.
// The drafting itself (template library or LLM) is injected as `draft`, so the engine stays dependency-free.
// AI proposes, a human decides: rows are inserted as 'proposada'; HR can only approve or discard. Nothing is tracked.
// Input to `draft` is aggregate only: labels, score, change, n, confidence, insight summaries. No accounts, no comments.
import { DEFAULT_CONFIG, resolveConfig, type EngineConfig } from "./config.ts";
import { all, run, transaction, type SqlDatabase } from "./db.ts";
import { toSqlDatetime } from "./time.ts";

export interface RecInsight {
  kind: string;
  summary: string;
  quadrant?: string;
  lowestShift?: string | null;
}

export interface RecommendationContext {
  alarmType: string;
  severity: "info" | "warning" | "critical";
  domain: string;
  collective: string | null;
  shift: string | null;
  period: string;
  score: number | null;
  change: number | null;
  n: number;
  confidence: number | null;
  insights: RecInsight[];
  themes?: string[];
}

export interface RecommendationProposal {
  title: string;
  action: string;
  initiative: string;
  suggestedOwner: string;
  suggestedTimeframe: string;
  rationale: string;
  limits: string;
  source: "llm" | "template";
}

export type DraftFn = (ctx: RecommendationContext) => Promise<RecommendationProposal[]> | RecommendationProposal[];

export interface RecommendationOptions {
  now: number;
  draft: DraftFn;
  config?: Partial<EngineConfig>;
  /** Proposals kept per alarm (default 3). */
  maxPerAlarm?: number;
}

export interface RecommendationReport {
  /** Alarms that received proposals in this run. */
  alarms: number;
  /** Proposal rows inserted. */
  proposals: number;
  /** Open alarms skipped because they already have proposals. */
  alreadyDrafted: number;
  /** Alarms whose draft was empty or threw. */
  failed: number;
}

/** Lideratge alarms stay HR-only: a manager role is never suggested as the owner, so the proposal cannot point at the assessed manager. */
const MANAGER_ROLE = /^(cap|responsable|encarregat|supervisor|director|gerent)\b/i;
const HR_ONLY_DOMAIN = "Lideratge";

interface AlarmRow {
  id: number;
  tipus: string;
  severity: "info" | "warning" | "critical";
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number | null;
  periode: string;
  n: number;
  confianca: number | null;
  collectiu: string | null;
  torn: string | null;
  domini: string | null;
}

interface InsightRow {
  kind: string;
  torn_id: number | null;
  detail_json: string | null;
}

function insightSummary(r: InsightRow): RecInsight | null {
  if (!r.detail_json) return null;
  let d: Record<string, any>;
  try {
    d = JSON.parse(r.detail_json);
  } catch {
    return null;
  }
  if (r.kind === "importance_gap") {
    const text: Record<string, string> = {
      act_first: "el domini és dels més importants per al col·lectiu i puntua baix",
      maintain: "el domini és important i puntua bé",
      monitor: "el domini és poc prioritari i puntua baix",
      low_priority: "el domini és poc prioritari",
    };
    return { kind: r.kind, summary: text[String(d.quadrant)] ?? "diferència entre importància i puntuació", quadrant: String(d.quadrant) };
  }
  if (r.kind === "segment_gap") {
    const lo = d.lowest?.label ?? null;
    return { kind: r.kind, summary: `diferència de ${d.gap} punts entre torns${lo ? `, el més baix és ${lo}` : ""}`, lowestShift: lo };
  }
  if (r.kind === "polarisation") return { kind: r.kind, summary: `el consens ha caigut ${d.consensusDrop} punts amb la puntuació gairebé estable` };
  return null;
}

function buildContext(db: SqlDatabase, a: AlarmRow): RecommendationContext {
  // Latest visible aggregate of the segment, and the one before it, for score and change.
  const hist = all<{ score: number | null; periode: string }>(
    db,
    `SELECT score, periode FROM agregat
     WHERE collectiu_id IS ? AND torn_id IS ? AND domini_id = ? AND suprimit = 0 AND score IS NOT NULL AND periode <= ?
     ORDER BY periode DESC LIMIT 2`,
    a.collectiu_id,
    a.torn_id,
    a.domini_id,
    a.periode,
  );
  const cur = hist[0]?.periode === a.periode ? hist[0].score : (hist[0]?.score ?? null);
  const prev = hist[1]?.score ?? null;
  const ins = all<InsightRow>(
    db,
    `SELECT kind, torn_id, detail_json FROM insight
     WHERE suprimit = 0 AND periode = ? AND domini_id IS ? AND collectiu_id IS ? AND kind IN ('importance_gap','segment_gap','polarisation')
       AND (kind <> 'polarisation' OR torn_id IS ?)
     ORDER BY kind, id`,
    a.periode,
    a.domini_id,
    a.collectiu_id,
    a.torn_id,
  );
  return {
    alarmType: a.tipus,
    severity: a.severity,
    domain: a.domini ?? "",
    collective: a.collectiu,
    shift: a.torn,
    period: a.periode,
    score: cur,
    change: cur !== null && prev !== null ? Math.round((cur - prev) * 100) / 100 : null,
    n: a.n,
    confidence: a.confianca,
    insights: ins.map(insightSummary).filter((x): x is RecInsight => x !== null),
  };
}

/**
 * For each open, non-suppressed alarm without a recommendation, asks `draft` for 1 to 3 proposals and stores them as 'proposada'.
 * Idempotent: an alarm that already has any recomanacio row (in any state) is left alone, so a discarded proposal is not redrafted.
 * Suppressed segments (alarm suppressed, or n below the minimum group size) get nothing.
 */
export async function runRecommendations(db: SqlDatabase, opts: RecommendationOptions): Promise<RecommendationReport> {
  const cfg = resolveConfig(db, opts.config);
  const minN = cfg.minGroupSize ?? DEFAULT_CONFIG.minGroupSize;
  const max = opts.maxPerAlarm ?? 3;
  const report: RecommendationReport = { alarms: 0, proposals: 0, alreadyDrafted: 0, failed: 0 };

  const rows = all<AlarmRow>(
    db,
    `SELECT s.id, s.tipus, s.severity, s.collectiu_id, s.torn_id, s.domini_id, s.periode, s.n, s.confianca,
            c.nom AS collectiu, t.nom AS torn, d.nom AS domini
     FROM senyal s
     LEFT JOIN collectiu c ON c.id = s.collectiu_id
     LEFT JOIN torn t ON t.id = s.torn_id
     LEFT JOIN domini d ON d.id = s.domini_id
     WHERE s.status = 'open' AND s.suprimit = 0 AND s.domini_id IS NOT NULL AND s.n >= ?
     ORDER BY s.id`,
    minN,
  );
  const have = new Set(all<{ senyal_id: number }>(db, "SELECT DISTINCT senyal_id FROM recomanacio WHERE senyal_id IS NOT NULL").map((r) => r.senyal_id));
  const nowSql = toSqlDatetime(opts.now);

  for (const a of rows) {
    if (have.has(a.id)) {
      report.alreadyDrafted++;
      continue;
    }
    let props: RecommendationProposal[];
    try {
      props = (await opts.draft(buildContext(db, a))).slice(0, max);
    } catch {
      props = [];
    }
    if (props.length === 0) {
      report.failed++;
      continue;
    }
    const hrOnly = a.domini === HR_ONLY_DOMAIN;
    transaction(db, () => {
      for (const p of props) {
        const owner = hrOnly && MANAGER_ROLE.test(p.suggestedOwner.trim()) ? "RRHH" : p.suggestedOwner;
        run(
          db,
          `INSERT INTO recomanacio (senyal_id, text, estat, creat, titol, iniciativa, responsable_suggerit, termini_suggerit, justificacio, limits, font)
           VALUES (?, ?, 'proposada', ?, ?, ?, ?, ?, ?, ?, ?)`,
          a.id,
          p.action,
          nowSql,
          p.title,
          p.initiative,
          owner,
          p.suggestedTimeframe,
          p.rationale,
          p.limits,
          p.source,
        );
      }
    });
    report.alarms++;
    report.proposals += props.length;
  }
  return report;
}
