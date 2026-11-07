import Link from "next/link";
import { listJoinCodes } from "@damm/db/hr";
import { Card, Empty, PageHeader } from "../ui";
import { CopyButton } from "./copy-button";
import { joinUrl, qrSvg } from "./qr";

export default async function PublishPage() {
  const codes = listJoinCodes();
  const items = await Promise.all(codes.map(async (c) => ({ ...c, url: joinUrl(c.codi), svg: await qrSvg(joinUrl(c.codi)) })));
  return (
    <>
      <PageHeader
        title="Enllaços i QR per col·lectiu"
        subtitle="Comparteix l'enllaç o imprimeix el cartell. Les persones s'hi apunten sense dades personals."
      />
      {items.length === 0 ? (
        <Empty>Encara no hi ha cap codi d&apos;accés.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((c) => (
            <Card key={c.codi} title={c.collectiu} meta={<span className="num">{c.comptes} comptes</span>}>
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
    </>
  );
}
