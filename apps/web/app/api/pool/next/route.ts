import { getCompteId } from "@/lib/session";
import { nextQuestionsForToday } from "@damm/db/employee";
import type { PoolNextResponse } from "@damm/shared";

export const dynamic = "force-dynamic";

// Stub selection until packages/engine lands (spec build step 7). The account comes from the
// session cookie only, never from a request parameter.
export async function GET() {
  const compteId = await getCompteId();
  if (!compteId) return Response.json({ error: "no_autenticat" }, { status: 401 });
  const body: PoolNextResponse = { preguntes: nextQuestionsForToday(compteId) };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
