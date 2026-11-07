import Link from "next/link";
import { lookupJoinCode } from "@damm/db/join";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ codi: string }> }) {
  const { codi } = await params;
  const info = lookupJoinCode(codi.toUpperCase());
  const valid = info !== null && info.actiu;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      {valid ? (
        <>
          <div className="space-y-1">
            <p className="text-sm opacity-60">Escolta activa</p>
            <h1 className="text-2xl font-semibold">Et donem la benvinguda a {info.empresa}</h1>
          </div>
          <div className="rounded border p-4 text-sm">
            <div className="opacity-60">Col·lectiu</div>
            <div className="text-lg font-medium">{info.collectiu}</div>
          </div>
          <p className="text-sm opacity-70">
            Les teves respostes són anònimes i només es mostren de forma agregada.
          </p>
          <Link
            href={`/onboarding?codi=${encodeURIComponent(codi.toUpperCase())}`}
            className="rounded bg-black px-4 py-3 text-center text-white dark:bg-white dark:text-black"
          >
            Continua
          </Link>
        </>
      ) : (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Codi no vàlid</h1>
          <p className="text-sm opacity-70">
            Aquest codi no existeix o ja no està actiu. Comprova l&apos;enllaç o demana un codi nou al teu equip.
          </p>
          <Link href="/join" className="inline-block underline text-sm">Torna a provar amb un altre codi</Link>
        </div>
      )}
    </main>
  );
}
