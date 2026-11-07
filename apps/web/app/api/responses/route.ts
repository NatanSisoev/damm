import { z } from "zod";
import { getCompteId } from "@/lib/session";
import { saveResponses } from "@damm/db/employee";
import type { PostResponsesRequest } from "@damm/shared";

export const dynamic = "force-dynamic";

// Mirrors PostResponsesRequest from @damm/shared. Per-question rules (approved, visible to the
// account's collective, value within the scale, one answer per day) are enforced in saveResponses.
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
  pregunta_invalida: 400,
  valor_invalid: 400,
  comentari_obligatori: 400,
  ja_respost: 409,
  redaccio_fallida: 500,
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

  const res = saveResponses(compteId, parsed.data.respostes, parsed.data.canal ?? "app");
  if (!res.ok) return Response.json({ error: res.error }, { status: STATUS[res.error] });
  return new Response(null, { status: 204 });
}
