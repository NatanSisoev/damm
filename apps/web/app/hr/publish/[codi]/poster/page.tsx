import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { minutes } from "../../../labels";
import { getTL } from "@/lib/i18n/server";
import { hrDict, collectiveLabel } from "@/lib/i18n/hr";
import { Wordmark } from "../../../../wordmark";
import { joinUrl, qrSvg } from "../../qr";
import { PrintButton } from "./print-button";

export default async function PosterPage({ params }: PageProps<"/hr/publish/[codi]/poster">) {
  const { codi } = await params;
  const { t, lang } = await getTL(hrDict);
  const name = (c: string) => collectiveLabel(c, lang);
  const row = listJoinCodes().find((c) => c.codi === codi);
  if (!row) notFound();
  const url = joinUrl(row.codi);
  const svg = await qrSvg(url);
  const promises = [
    t("poster_p1"),
    t("poster_p2", { min: MIN_GROUP_SIZE }),
    t("poster_p3"),
  ];
  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        .poster-root { --brand-red: #c8201a; position: fixed; inset: 0; z-index: 50; overflow: auto; background: #fff; color: #111; }
        @media print {
          .hr-bar, .hr-shell > footer { display: none !important; }
          .hr-shell { display: block !important; min-height: 0 !important; }
          main { padding: 0 !important; }
          html, body { background: #fff !important; }
          .poster-root { position: static; overflow: visible; }
          .poster-toolbar { display: none !important; }
          .poster-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="poster-root">
        <div className="poster-toolbar flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <Link href="/hr/publish" className="btn btn-ghost">{t("back")}</Link>
          <PrintButton />
        </div>
        <div
          className="poster-page mx-auto my-6 flex flex-col items-center bg-white px-[16mm] py-[14mm] text-center shadow-lg"
          style={{ width: "210mm", height: "297mm", boxSizing: "border-box", overflow: "hidden", breakInside: "avoid" }}
        >
          <Wordmark className="text-[11mm] leading-none" />
          <p className="mt-[6mm] text-[5mm] font-medium uppercase tracking-[0.2em] text-neutral-500">
            {t("poster_kicker", { name: name(row.collectiu) })}
          </p>
          <h1 className="mt-[8mm] text-[12mm] font-bold leading-[1.1] text-balance">{t("poster_h1", { minutes: minutes(1, lang) })}</h1>
          <div
            role="img"
            aria-label={t("pub_qr_aria", { name: name(row.collectiu) })}
            className="mt-[10mm] size-[110mm] rounded-[4mm] border-[0.6mm] border-neutral-900 bg-white p-[3mm] [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-[5mm] break-all text-[4.5mm] text-neutral-600">{url}</p>
          <ul className="mt-auto w-full space-y-[3mm] text-left">
            {promises.map((p) => (
              <li key={p} className="flex items-center gap-[4mm] rounded-[3mm] bg-neutral-100 px-[6mm] py-[4mm] text-[5mm] font-medium">
                <span aria-hidden className="grid size-[8mm] shrink-0 place-items-center rounded-full bg-[var(--brand-red)] text-[5mm] text-white">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
