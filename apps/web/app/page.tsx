import Link from "next/link";
import { redirect } from "next/navigation";
import { approvedActionsForCompte } from "@damm/db/employee";
import { vapidPublicKey } from "@/lib/push";
import { getCompteId } from "@/lib/session";
import { ActionsList } from "./(employee)/components/actions-list";
import { AnswerFlow } from "./(employee)/components/answer-flow";
import { PushToggle } from "./(employee)/components/push-toggle";
import { EmployeeShell } from "./(employee)/components/shell";

export const dynamic = "force-dynamic";

// Employee home: today's questions, one at a time, then what changed because people answered.
// Without a session the person goes to login.
export default async function Home() {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const actions = approvedActionsForCompte(compteId);
  const vapidKey = vapidPublicKey();
  return (
    <EmployeeShell>
      <AnswerFlow compteId={compteId} />
      {vapidKey && <PushToggle vapidKey={vapidKey} compact />}
      <ActionsList actions={actions} />
      <p className="mt-6 text-center text-sm text-subtle">
        <Link href="/privacitat" className="inline-flex h-11 items-center underline underline-offset-2">
          Com tractem les teves dades
        </Link>
      </p>
    </EmployeeShell>
  );
}
