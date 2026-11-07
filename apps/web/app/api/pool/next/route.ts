import { getCompteId } from "@/lib/session";
import { getEngine } from "@/lib/engine";
import { EngineError } from "@damm/engine";
import type { PoolNextResponse } from "@damm/shared";

export const dynamic = "force-dynamic";

// Today's fixed batch from @damm/engine. The account comes from the session cookie only, never
// from a request parameter. Already answered items are left out: the client shows what is left.
export async function GET() {
  const compteId = await getCompteId();
  if (!compteId) return Response.json({ error: "no_autenticat" }, { status: 401 });
  try {
    const batch = getEngine().getDailyBatch(compteId);
    const body: PoolNextResponse = {
      preguntes: batch.items
        .filter((i) => !i.answered)
        .map((i) => ({
          id: i.questionId,
          dominiId: i.domainId,
          text: i.text,
          tipus: i.type,
          // Labels only: the engine never sends option scores to the client.
          options: i.options as PoolNextResponse["preguntes"][number]["options"],
        })),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: "no_autenticat" }, { status: 401 });
    throw e;
  }
}
