import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes, listNeeds } from "@damm/db/hr";
import { closeNeedAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { needStatus } from "../labels";
import { CopyButton } from "./copy-button";
import { baseUrl, joinUrl, qrSvg } from "./qr";

export default async function PublishPage() {
  const codes = listJoinCodes();
  const needs = listNeeds();
  const items = await Promise.all(codes.map(async (c) => ({ ...c, url: joinUrl(c.codi), svg: await qrSvg(joinUrl(c.codi)) })));
  return (
    <>
      <PageHeader
        title="Enllaços i QR per col·lectiu"
        subtitle="Comparteix l'enllaç o imprimeix el cartell. Les persones s'hi apunten sense dades personals."
      />
      {/^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl()) && (
        <p role="note" className="mb-4 rounded-lg border border-line-strong px-3 py-2 text-sm">
          Els enllaços i QR apunten a <code>{baseUrl()}</code>, que només funciona en aquest ordinador. Per provar amb un
          mòbil, defineix <code>PUBLIC_BASE_URL</code> amb l&apos;adreça pública (túnel HTTPS) i reinicia el servidor.
        </p>
      )}
      {items.length === 0 ? (
        <Empty>Encara no hi ha cap codi d&apos;accés.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((c) => (
            <Card key={c.codi} title={c.collectiu} meta={
              c.showsCount ? (
                <span className="num" title={c.comptesSuppressed ? `Menys de ${MIN_GROUP_SIZE} comptes` : undefined}>
                  {c.comptesSuppressed ? `<${MIN_GROUP_SIZE}` : c.comptes} comptes al col·lectiu
                </span>
              ) : undefined
            }>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  role="img"
                  aria-label={`Codi QR per a ${c.collectiu}`}
                  className="size-40 shrink-0 rounded-lg border border-line bg-white p-1 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: c.svg }}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="text-xs font-medium text-subtle">Codi {c.actiu ? "" : "(inactiu)"}</div>
                    <div className="num font-semibold tracking-wide">{c.codi}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-subtle">Enllaç d&apos;accés</div>
                    <code className="block break-all text-[13px]">{c.url}</code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={c.url} />
                    <Link href={`/hr/publish/${c.codi}/poster`} target="_blank" className="btn btn-primary">
                      Cartell per imprimir
                    </Link>
                    <Link href={`/hr/publish/${c.codi}/teams`} className="btn btn-ghost">
                      Publica a Teams
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card title="Necessitats" meta={<span className="num">{needs.length}</span>} className="mt-6">
        {needs.length === 0 ? (
          <Empty>Encara no hi ha cap necessitat.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {needs.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`badge ${needStatus(n.estat).cls}`}>{needStatus(n.estat).label}</span>
                <span className="min-w-0 flex-1 text-[13px]">{n.textNl}{n.collectiu ? ` · ${n.collectiu}` : ""}</span>
                {n.estat !== "tancada" && (
                  <form action={closeNeedAction}><input type="hidden" name="id" value={n.id} /><button className="btn">Tanca la necessitat</button></form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-subtle">Tancar una necessitat és una decisió de l&apos;equip: no en recull noves respostes de seguiment i surt de la llista d&apos;obertes.</p>
      </Card>
    </>
  );
}
