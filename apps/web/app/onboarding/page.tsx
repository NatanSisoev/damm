import Link from "next/link";
import { lookupJoinCode } from "@damm/db/join";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ codi?: string }> }) {
  const { codi: raw } = await searchParams;
  const codi = (raw ?? "").trim().toUpperCase();
  const info = codi ? lookupJoinCode(codi) : null;
  const valid = info !== null && info.actiu;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {valid ? (
        <>
          <OnboardingForm codi={codi} empresa={info.empresa} collectiu={info.collectiu} />
          <p className="text-center text-sm">
            Ja tens compte? <Link href="/login" className="underline">Inicia la sessió</Link>
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Codi no vàlid</h1>
          <p className="text-sm opacity-70">
            Aquest codi no existeix o ja no està actiu. Comprova l&apos;enllaç o demana un codi nou al teu equip.
          </p>
        </div>
      )}
    </main>
  );
}
