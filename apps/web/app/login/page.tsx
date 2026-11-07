import { CompanyLabel, EmployeeFrame, PageHead } from "../(employee)/components/frame";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 md:py-8">
        <PageHead title="Torna a entrar" lede="Continua on ho vas deixar." />
        <div className="px-4 pb-8">
          <LoginForm />
        </div>
        <CompanyLabel />
      </main>
    </EmployeeFrame>
  );
}
