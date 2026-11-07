import { redirect } from "next/navigation";
import { getCompteId } from "@/lib/session";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getCompteId())) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Configuració</h1>
      <p className="text-sm opacity-70">Les teves respostes són anònimes i només es mostren de forma agregada.</p>
      <form action={logoutAction}>
        <button className="w-full rounded border px-4 py-3">Tanca la sessió</button>
      </form>
    </main>
  );
}
