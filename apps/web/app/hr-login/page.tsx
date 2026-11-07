import { loginAction } from "./actions";
import { HrScope } from "../hr/theme";
import { LangSwitcher } from "@/components/lang-switcher";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";

export default async function HrLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const t = await getT(hrDict);
  return (
    <HrScope>
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">{t("login_title")}</h1>
      <p className="text-[13px] text-muted">{t("login_intro")}</p>
      <form action={loginAction} className="space-y-3">
        <input type="hidden" name="next" value={next ?? "/hr"} />
        <label className="block text-xs font-medium text-subtle" htmlFor="code">{t("login_code")}</label>
        <input id="code" name="code" type="password" autoComplete="off" required className="input w-full" />
        {error && <p role="alert" className="text-[13px] text-warn">{t("login_error")}</p>}
        <button className="btn btn-primary w-full">{t("login_submit")}</button>
      </form>
      <LangSwitcher />
    </main>
    </HrScope>
  );
}
