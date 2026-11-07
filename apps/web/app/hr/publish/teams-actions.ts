"use server";

import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { joinUrl } from "./qr";
import { buildTeamsCard, teamsMessage } from "./teams-card";

export type SendState = { ok: boolean; message: string } | null;

export async function sendToTeams(_prev: SendState, formData: FormData): Promise<SendState> {
  const hook = process.env.TEAMS_WEBHOOK_URL;
  if (!hook) return { ok: false, message: "Falta TEAMS_WEBHOOK_URL." };
  const codi = String(formData.get("codi") ?? "");
  const row = listJoinCodes().find((c) => c.codi === codi);
  if (!row) return { ok: false, message: "Codi desconegut." };
  const card = buildTeamsCard({ collectiu: row.collectiu, url: joinUrl(row.codi), minGroup: MIN_GROUP_SIZE });
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsMessage(card)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, message: `Teams ha respost ${res.status}.` };
    return { ok: true, message: "Targeta enviada al canal." };
  } catch {
    return { ok: false, message: "No s'ha pogut contactar amb Teams." };
  }
}
