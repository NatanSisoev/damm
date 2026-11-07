import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listJoinCodes } from "@damm/db/hr";
import { DammLogo } from "../../../damm-logo";
import { joinUrl, qrSvg } from "../../qr";
import { PrintButton } from "./print-button";

export default async function PosterPage({ params }: PageProps<"/hr/publish/[codi]/poster">) {
  const { codi } = await params;
  const row = listJoinCodes().find((c) => c.codi === codi);
  if (!row) notFound();
  const url = joinUrl(row.codi);
  const svg = await qrSvg(url);
  const promises = [
    "Sense noms: no et demanem cap dada personal.",
    `Mai es mostren dades de grups de menys de ${MIN_GROUP_SIZE} persones.`,
    "La IA proposa, una persona decideix.",
  ];
  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        .poster-root { position: fixed; inset: 0; z-index: 50; overflow: auto; background: #fff; color: #111; }
        @media print {
          aside { display: none !important; }
          div:has(> aside) { display: block !important; min-height: 0 !important; }
          main { padding: 0 !important; }
          html, body { background: #fff !important; }
          .poster-root { position: static; overflow: visible; }
          .poster-toolbar { display: none !important; }
          .poster-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="poster-root">
        <div className="poster-toolbar flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <Link href="/hr/publish" className="btn btn-ghost">← Tornar</Link>
          <PrintButton />
        </div>
        <div
          className="poster-page mx-auto my-6 flex flex-col items-center bg-white px-[16mm] py-[14mm] text-center shadow-lg"
          style={{ width: "210mm", height: "297mm", boxSizing: "border-box", overflow: "hidden", breakInside: "avoid" }}
        >
          <DammLogo className="h-[18mm] w-auto text-[#c8102e]" />
          <p className="mt-[6mm] text-[5mm] font-medium uppercase tracking-[0.2em] text-neutral-500">
            Escolta activa · {row.collectiu}
          </p>
          <h1 className="mt-[8mm] text-[12mm] font-bold leading-[1.1] text-balance">Escaneja i respon en 1&nbsp;minut</h1>
          <div
            role="img"
            aria-label={`Codi QR per a ${row.collectiu}`}
            className="mt-[10mm] size-[110mm] rounded-[4mm] border-[0.6mm] border-neutral-900 bg-white p-[3mm] [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-[5mm] break-all text-[4.5mm] text-neutral-600">{url}</p>
          <ul className="mt-auto w-full space-y-[3mm] text-left">
            {promises.map((p) => (
              <li key={p} className="flex items-center gap-[4mm] rounded-[3mm] bg-neutral-100 px-[6mm] py-[4mm] text-[5mm] font-medium">
                <span aria-hidden className="grid size-[8mm] shrink-0 place-items-center rounded-full bg-[#c8102e] text-[5mm] text-white">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
