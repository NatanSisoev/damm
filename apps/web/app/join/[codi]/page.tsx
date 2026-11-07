import Link from "next/link";
import { lookupJoinCode } from "@damm/db/join";
import { BrandFrame, BrandHero, PrivacyNote } from "../../(employee)/components/brand";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ codi: string }> }) {
  const { codi } = await params;
  const info = lookupJoinCode(codi.toUpperCase());
  const valid = info !== null && info.actiu;

  return (
    <BrandFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        {valid ? (
          <>
            <BrandHero eyebrow={info.empresa} title="Et donem la benvinguda" lede={`Les teves respostes a ${info.empresa} són anònimes i només es mostren agregades.`} />
            <div className="space-y-4 px-4">
              <div className="card p-4">
                <div className="text-sm text-muted">Col·lectiu</div>
                <div className="text-lg font-bold">{info.collectiu}</div>
              </div>
              <Link
                href={`/onboarding?codi=${encodeURIComponent(codi.toUpperCase())}`}
                className="btn btn-primary h-14 w-full justify-center text-base"
              >
                Continua
              </Link>
              <PrivacyNote>
                Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més.
              </PrivacyNote>
              <p className="pb-8 text-center text-sm">
                <Link href="/privacitat" className="underline">
                  Com tractem les teves dades
                </Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <BrandHero title="Codi no vàlid" lede="Aquest codi no existeix o ja no està actiu. Comprova l'enllaç o demana un codi nou al teu equip." />
            <p className="px-4">
              <Link href="/join" className="btn">
                Torna a provar amb un altre codi
              </Link>
            </p>
          </>
        )}
      </main>
    </BrandFrame>
  );
}
