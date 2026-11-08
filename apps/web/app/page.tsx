import Link from "next/link";
import { redirect } from "next/navigation";
import { approvedActionsForCompte } from "@damm/db/employee";
import { vapidPublicKey } from "@/lib/push";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { getCompteId } from "@/lib/session";
import { ActionsLink } from "./(employee)/components/actions-list";
import { AnswerFlow } from "./(employee)/components/answer-flow";
import { PushToggle } from "./(employee)/components/push-toggle";
import { EmployeeShell } from "./(employee)/components/shell";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("home");

export const dynamic = "force-dynamic";

// Employee home: today's questions, one at a time, then what changed because people answered.
// Without a session the person goes to login.
export default async function Home() {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const t = await getT(employeeDict);
  const actions = approvedActionsForCompte(compteId);
  const vapidKey = vapidPublicKey();
  return (
    <EmployeeShell>
      <AnswerFlow compteId={compteId} />
      {vapidKey && <PushToggle vapidKey={vapidKey} compact />}
      <ActionsLink actions={actions} />
      <p className="mt-6 text-center text-sm text-subtle">
        <Link href="/privacitat" className="inline-flex h-11 items-center underline underline-offset-2">
          {t("privacy_link")}
        </Link>
      </p>
    </EmployeeShell>
  );
}
