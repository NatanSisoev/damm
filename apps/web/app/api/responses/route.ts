import { z } from "zod";
import { getCompteId } from "@/lib/session";
import { getEngine } from "@/lib/engine";
import { EngineError } from "@damm/engine";
import { maybeFireDemoAlarm } from "@/lib/demo-tripwire";
import { getLang } from "@/lib/lang";
import { getQuestionTranslations } from "@damm/db/employee";
import { pickText, type PoolFollowup, type PostResponsesRequest, type PostResponsesResult } from "@damm/shared";

export const dynamic = "force-dynamic";

// Mirrors PostResponsesRequest from @damm/shared. Per-question rules (in today's batch or in the pending
// campaign set, value for the type, one answer per question, comment redaction) are enforced by @damm/engine submitAnswers.
const bodySchema = z.object({
  respostes: z
    .array(
      z.object({
        preguntaId: z.number().int().positive(),
        valorNum: z.number().finite().nullish(),
        comentari: z.string().max(1000).nullish(),
        valueJson: z.array(z.number().int().min(0)).max(20).nullish(),
        answerMs: z.number().int().min(0).max(86_400_000).nullish(),
      }),
    )
    .min(1)
    .max(10),
  canal: z.enum(["app", "mobil_qr"]).optional(),
}) satisfies z.ZodType<PostResponsesRequest>;

const STATUS = {
  not_in_todays_batch: 400,
  invalid_value: 400,
  missing_comment: 400,
  already_answered: 409,
} as const;

// Request bodies and comments are never logged.
export async function POST(request: Request) {
  const compteId = await getCompteId();
  if (!compteId) return Response.json({ error: "no_autenticat" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "json_invalid" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "peticio_invalida" }, { status: 400 });

  let result;
  try {
    result = getEngine().submitAnswers(compteId, parsed.data.respostes, { channel: parsed.data.canal ?? "app" });
  } catch (e) {
    if (e instanceof EngineError) return Response.json({ error: "no_autenticat" }, { status: 401 });
    throw e;
  }
  const bad = result.rejected[0];
  if (bad) return Response.json({ error: bad.reason, preguntaId: bad.questionId }, { status: STATUS[bad.reason] });
  maybeFireDemoAlarm(parsed.data.respostes); // demo only, off unless DEMO_TRIPWIRE=1
  if (result.followups.length === 0) return new Response(null, { status: 204 });
  // A low scale answer or a "no" triggers its linked open follow-up: returned here, shown right after, skippable.
  const lang = await getLang();
  const tr = getQuestionTranslations(result.followups.map((f) => f.questionId));
  const body: PostResponsesResult = {
    followups: result.followups.map<PoolFollowup>((f) => ({
      id: f.questionId,
      dominiId: f.domainId,
      text: pickText(tr.get(f.questionId)?.text, f.text, lang),
      tipus: f.type,
      options: null,
      parentId: f.parentId,
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
