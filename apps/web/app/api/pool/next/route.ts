import { getCompteId } from "@/lib/session";
import { getEngine } from "@/lib/engine";
import { getLang } from "@/lib/lang";
import { getQuestionTranslations } from "@damm/db/employee";
import { EngineError } from "@damm/engine";
import { pickText, type PoolNextResponse } from "@damm/shared";

export const dynamic = "force-dynamic";

// Today's fixed batch from @damm/engine. The account comes from the session cookie only, never
// from a request parameter. Already answered items are left out: the client shows what is left.
// The batch is exactly the daily cap, one answer type, no free-text items (C18 revised, C23).
// Text is in the user's language, then Catalan, then the stored text.
export async function GET() {
  const compteId = await getCompteId();
  if (!compteId) return Response.json({ error: "no_autenticat" }, { status: 401 });
  try {
    const batch = getEngine().getDailyBatch(compteId);
    // Translations live in the DB (text_i18n / options i18n); the engine only knows the base text.
    // Merged here by question id, falling back to Catalan and then to the stored text.
    const lang = await getLang();
    const tr = getQuestionTranslations(batch.items.map((i) => i.questionId));
    const body: PoolNextResponse = {
      preguntes: batch.items
        .filter((i) => !i.answered)
        .map((i) => {
          const t = tr.get(i.questionId);
          return {
            id: i.questionId,
            dominiId: i.domainId,
            text: pickText(t?.text, i.text, lang),
            tipus: i.type,
            // Labels only: the engine never sends option scores to the client.
            options: (i.options as { label: string }[] | null | undefined)?.map((o, k) => ({
              ...o,
              label: pickText(t?.options[k], o.label, lang),
            })) as PoolNextResponse["preguntes"][number]["options"],
          };
        }),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: "no_autenticat" }, { status: 401 });
    throw e;
  }
}
