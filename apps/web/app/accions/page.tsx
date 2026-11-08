import { redirect } from "next/navigation";
import { approvedActionsForCompte } from "@damm/db/employee";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { pageTitle } from "@/lib/i18n/titles";
import { getCompteId } from "@/lib/session";
import { ActionsList } from "../(employee)/components/actions-list";
import { EmployeeShell } from "../(employee)/components/shell";

export const generateMetadata = pageTitle("actions");

export const dynamic = "force-dynamic";

// "Has dit, hem fet": the full list of actions HR approved for this person's collective.
export default async function ActionsPage() {
  const compteId = await getCompteId();
  if (!compteId) redirect("/login");
  const t = await getT(employeeDict);
  const actions = approvedActionsForCompte(compteId);
  return (
    <EmployeeShell
      back
      backHref="/"
      backLabel={t("nav_home")}
      title={t("actions_title")}
    >
      <h1 className="page-title">{t("actions_title")}</h1>
      <p className="mt-1 text-subtle">{t("actions_lede")}</p>
      <ActionsList actions={actions} />
    </EmployeeShell>
  );
}
