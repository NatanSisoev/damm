import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes, listNeeds } from "@damm/db/hr";
import { ConfirmButton } from "../confirm-button";
import { closeNeedAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { needStatus } from "../labels";
import { getTL } from "@/lib/i18n/server";
import { hrDict, collectiveLabel } from "@/lib/i18n/hr";
import { rich } from "@/lib/i18n/rich";
import { CopyButton } from "./copy-button";
import { baseUrl, joinUrl, qrSvg } from "./qr";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_publish");

export default async function PublishPage() {
  const { t, lang } = await getTL(hrDict);
  const codes = listJoinCodes();
  const needs = listNeeds();
  const items = await Promise.all(codes.map(async (c) => ({ ...c, url: joinUrl(c.codi), svg: await qrSvg(joinUrl(c.codi)) })));
  return (
    <>
      <PageHeader
        title={t("pub_title")}
        subtitle={t("pub_subtitle")}
      />
      {/^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl()) && (
        <p role="note" className="mb-4 rounded-lg border border-line-strong px-3 py-2 text-sm">
          {rich(t("pub_localhost_note", { base: "{base}", env: "{env}" }), { base: <code>{baseUrl()}</code>, env: <code>PUBLIC_BASE_URL</code> })}
        </p>
      )}
      {items.length === 0 ? (
        <Empty>{t("pub_no_codes")}</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((c) => (
            <Card key={c.codi} className="scroll-mt-20" id={c.codi} title={collectiveLabel(c.collectiu, lang)} meta={
              c.showsCount ? (
                <span className="num" title={c.comptesSuppressed ? t("pub_accounts_few", { min: MIN_GROUP_SIZE }) : undefined}>
                  {t("pub_accounts_line", { n: c.comptesSuppressed ? `<${MIN_GROUP_SIZE}` : (c.comptes ?? 0) })}
                </span>
              ) : undefined
            }>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  role="img"
                  aria-label={t("pub_qr_aria", { name: collectiveLabel(c.collectiu, lang) })}
                  className="size-40 shrink-0 rounded-lg border border-line bg-white p-1 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: c.svg }}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="text-xs font-medium text-subtle">{c.actiu ? t("pub_code") : t("pub_code_inactive")}</div>
                    <div className="num font-semibold tracking-wide">{c.codi}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-subtle">{t("pub_invite_link")}</div>
                    <code className="block break-all text-[13px]">{c.url}</code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={c.url} />
                    <Link href={`/hr/publish/${c.codi}/poster`} target="_blank" className="btn btn-primary">
                      {t("pub_poster")}
                    </Link>
                    <Link href={`/hr/publish/${c.codi}/teams`} className="btn btn-ghost">
                      {t("pub_teams")}
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card title={t("pub_needs")} meta={<span className="num">{needs.length}</span>} className="mt-6">
        {needs.length === 0 ? (
          <Empty>{t("pub_no_needs")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {needs.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`badge ${needStatus(n.estat, lang).cls}`}>{needStatus(n.estat, lang).label}</span>
                <span className="min-w-0 flex-1 text-[13px]">{n.textNl}{n.collectiu ? ` · ${collectiveLabel(n.collectiu, lang)}` : ""}</span>
                {n.estat !== "tancada" && (
                  <form action={closeNeedAction}><input type="hidden" name="id" value={n.id} /><ConfirmButton className="btn" message={t("pub_close_confirm")}>{t("pub_close_need")}</ConfirmButton></form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-subtle">{t("pub_close_note")}</p>
      </Card>
    </>
  );
}
