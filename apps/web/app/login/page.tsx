import { redirect } from "next/navigation";
import { LangSwitcher } from "@/components/lang-switcher";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { getCompteId } from "@/lib/session";
import { CompanyLabel, EmployeeFrame, PageHead } from "../(employee)/components/frame";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCompteId()) redirect("/");
  const t = await getT(employeeDict);
  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <div className="flex justify-end px-4 pt-3">
          <LangSwitcher />
        </div>
        <PageHead title={t("login_title")} lede={t("login_lede")} />
        <div className="px-4 pb-8">
          <LoginForm />
        </div>
        <CompanyLabel />
      </main>
    </EmployeeFrame>
  );
}
