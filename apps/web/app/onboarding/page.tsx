import Link from "next/link";
import { lookupJoinCode } from "@damm/db/join";
import { BrandFrame, BrandHero } from "../(employee)/components/brand";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ codi?: string }> }) {
  const { codi: raw } = await searchParams;
  const codi = (raw ?? "").trim().toUpperCase();
  const info = codi ? lookupJoinCode(codi) : null;
  const valid = info !== null && info.actiu;

  return (
    <BrandFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        {valid ? (
          <>
            <BrandHero eyebrow={`${info.empresa} · ${info.collectiu}`} title="Crea el teu compte" />
            <div className="px-4 pb-8">
              <OnboardingForm codi={codi} />
              <p className="mt-6 text-center text-sm">
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
                Introdueix un altre codi
              </Link>
            </p>
          </>
        )}
      </main>
    </BrandFrame>
  );
}
