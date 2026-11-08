"use server";

import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { joinUrl } from "./qr";
import { buildTeamsCard, teamsMessage } from "./teams-card";

export type SendState = { ok: boolean; message: string } | null;

export async function sendToTeams(_prev: SendState, formData: FormData): Promise<SendState> {
  const { t, lang } = await getTL(hrDict);
  const hook = process.env.TEAMS_WEBHOOK_URL;
  if (!hook) return { ok: false, message: t("teams_err_no_hook", { env: "TEAMS_WEBHOOK_URL" }) };
  const codi = String(formData.get("codi") ?? "");
  const row = listJoinCodes().find((c) => c.codi === codi);
  if (!row) return { ok: false, message: t("teams_err_unknown_code") };
  const card = buildTeamsCard({ collectiu: row.collectiu, url: joinUrl(row.codi), minGroup: MIN_GROUP_SIZE, lang });
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsMessage(card)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, message: t("teams_err_status", { status: res.status }) };
    return { ok: true, message: t("teams_sent") };
  } catch {
    return { ok: false, message: t("teams_err_unreachable") };
  }
}
