import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@damm/db";
import { reinstateAlarmsForReadingPeriod } from "@damm/db/hr";
import { runEngineJob, runCommentAnalysisSync, runRecommendations } from "@damm/engine/job";
import { draftRecommendations } from "@damm/ai";
import { HR_COOKIE, accessToken, gateEnabled, gateMisconfigured } from "@/lib/hr-access";

// The analysis job: engine (aggregates, insights, alarms) -> comment themes -> recommendation proposals.
// Job code only: never call these from a dashboard request path. HR-only (same gate as /hr).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type EngineDb = Parameters<typeof runEngineJob>[0]; // better-sqlite3 satisfies the engine's minimal SqlDatabase at runtime
let running = false;

export async function POST(req: NextRequest) {
  if (gateMisconfigured()) return NextResponse.json({ error: "access not configured" }, { status: 503 });
  if (gateEnabled()) {
    const token = req.cookies.get(HR_COOKIE)?.value;
    if (!token || token !== (await accessToken(process.env.HR_ACCESS_CODE!))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (running) return NextResponse.json({ error: "job already running" }, { status: 409 });
  running = true;
  try {
    const db = getDb() as unknown as EngineDb;
    const now = Date.now();
    const engine = runEngineJob(db, { now });
    // A thin newest period (first live answer of a month) makes the engine hide every open alarm: bring back the readable ones.
    const reinstated = reinstateAlarmsForReadingPeriod();
    // Deterministic themes, summaries and emergent alarms (needs no key); must follow runEngineJob.
    const comments = runCommentAnalysisSync(db, { now });
    // Proposals for open alarms: LLM when LLM_BASE_URL and LLM_API_KEY are set, template library otherwise.
    const recommendations = await runRecommendations(db, { now, draft: (ctx) => draftRecommendations(ctx) });
    return NextResponse.json({ ok: true, engine, reinstatedAlarms: reinstated, comments, recommendations }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("job failed", e);
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  } finally {
    running = false;
  }
}
