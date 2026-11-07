import Link from "next/link";
import { redirect } from "next/navigation";
import { vapidPublicKey } from "@/lib/push";
import { getCompteId } from "@/lib/session";
import { PushToggle } from "../(employee)/components/push-toggle";
import { EmployeeShell } from "../(employee)/components/shell";
import { logoutAction } from "./actions";
import { ChangePasswordPanel, DeleteAccountPanel, RecoveryPanel } from "./account-panels";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getCompteId())) redirect("/login");
  return (
    <EmployeeShell back title="Configuració">
      <h1 className="page-title">Configuració</h1>
      <p className="mt-1 text-subtle">
        Les teves respostes són anònimes i només es mostren de forma agregada, en grups de 10 persones o més.
      </p>

      <section className="card mt-6">
        <div className="card-body space-y-2">
          <h2 className="section-title">Privadesa</h2>
          <p className="text-muted">Què recollim, què veu Recursos Humans i què no fem mai.</p>
          <Link href="/privacitat" className="btn h-12 w-full justify-center text-base">
            Llegeix com tractem les dades
          </Link>
        </div>
      </section>

      {vapidPublicKey() ? (
        <PushToggle vapidKey={vapidPublicKey()!} />
      ) : (
        <section className="card mt-4">
          <div className="card-body space-y-2">
            <h2 className="section-title">Notificacions</h2>
            <p className="text-muted">Les notificacions no estan activades en aquest servidor.</p>
          </div>
        </section>
      )}

      <ChangePasswordPanel />
      <RecoveryPanel />

      <section className="card mt-4">
        <div className="card-body space-y-2">
          <h2 className="section-title">Sessió</h2>
          <p className="text-muted">En tancar la sessió s&apos;esborra la subscripció a les notificacions d&apos;aquest dispositiu.</p>
          <form action={logoutAction}>
            <button className="btn h-12 w-full justify-center text-base">Tanca la sessió</button>
          </form>
        </div>
      </section>

      <DeleteAccountPanel />
    </EmployeeShell>
  );
}
