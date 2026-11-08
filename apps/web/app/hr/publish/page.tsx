import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { Card, Empty, PageHeader } from "../ui";
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
                    <div className="text-xs font-semibold text-subtle">{c.actiu ? t("pub_code") : t("pub_code_inactive")}</div>
                    <div className="num font-semibold tracking-wide">{c.codi}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-subtle">{t("pub_invite_link")}</div>
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
    </>
  );
}
