import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { Card, PageHeader } from "../../../ui";
import { CopyButton } from "../../copy-button";
import { joinUrl } from "../../qr";
import { SendButton } from "../../send-button";
import { getTL } from "@/lib/i18n/server";
import { hrDict, collectiveLabel } from "@/lib/i18n/hr";
import { rich } from "@/lib/i18n/rich";
import { buildTeamsCard } from "../../teams-card";

type Block = { type: string; text?: string; weight?: string; size?: string; isSubtle?: boolean };

export default async function TeamsPage({ params }: PageProps<"/hr/publish/[codi]/teams">) {
  const { codi } = await params;
  const { t, lang } = await getTL(hrDict);
  const row = listJoinCodes().find((c) => c.codi === codi);
  if (!row) notFound();
  const card = buildTeamsCard({ collectiu: row.collectiu, url: joinUrl(row.codi), minGroup: MIN_GROUP_SIZE, lang });
  const json = JSON.stringify(card, null, 2);
  const canSend = Boolean(process.env.TEAMS_WEBHOOK_URL);
  const action = card.actions[0] as { title: string };

  return (
    <>
      <PageHeader
        title={t("teams_title", { name: collectiveLabel(row.collectiu, lang) })}
        subtitle={t("teams_subtitle")}
        actions={<Link href="/hr/publish" className="btn btn-ghost">{t("back")}</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t("teams_preview")} meta={t("teams_channel")}>
          <div className="rounded-lg bg-[#f5f5f5] p-4" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
            <div className="mb-2 flex items-center gap-2 text-xs text-[#616161]">
              <span className="grid size-6 place-items-center rounded-full bg-[#5b5fc7] text-[10px] font-semibold text-white">EA</span>
              <span className="font-semibold text-[#242424]">Escolta activa</span>
              <span>{t("teams_now")}</span>
            </div>
            <div className="max-w-md rounded-md border border-[#e0e0e0] bg-white p-4 text-[#242424] shadow-sm">
              <div className="space-y-2">
                {(card.body as Block[]).map((b, i) => (
                  <p
                    key={i}
                    className={
                      b.size === "Large"
                        ? "text-[20px] font-semibold leading-tight"
                        : b.isSubtle
                          ? "text-[13px] text-[#616161]"
                          : "text-[14px]"
                    }
                  >
                    {b.text}
                  </p>
                ))}
              </div>
              <div className="mt-4 border-t border-[#e0e0e0] pt-3">
                <span className="block rounded border border-[#5b5fc7] px-3 py-1.5 text-center text-[14px] font-semibold text-[#5b5fc7]">
                  {action.title}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-subtle">{t("teams_preview_note")}</p>
        </Card>

        <div className="space-y-4">
          <Card title={t("teams_json")} meta={<CopyButton text={json} />}>
            <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-white p-3 text-[12px] text-[#242424]">{json}</pre>
            <p className="mt-2 text-xs text-subtle">
              {t("teams_json_note")}
            </p>
          </Card>
          <Card title={t("teams_send_title")}>
            {canSend ? (
              <SendButton codi={row.codi} />
            ) : (
              <p className="text-sm text-subtle">
                {rich(t("teams_ready", { env: "{env}" }), { env: <code>TEAMS_WEBHOOK_URL</code> })}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
