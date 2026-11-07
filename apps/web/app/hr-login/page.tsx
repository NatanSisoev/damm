import { loginAction } from "./actions";
import { HrScope } from "../hr/theme";

export default async function HrLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <HrScope>
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Portal de persones</h1>
      <p className="text-[13px] text-muted">Accés restringit a l&apos;equip de persones. Escriu el codi d&apos;accés de la demo.</p>
      <form action={loginAction} className="space-y-3">
        <input type="hidden" name="next" value={next ?? "/hr"} />
        <label className="block text-xs font-medium text-subtle" htmlFor="code">Codi d&apos;accés</label>
        <input id="code" name="code" type="password" autoComplete="off" required className="input w-full" />
        {error && <p role="alert" className="text-[13px] text-warn">Codi incorrecte.</p>}
        <button className="btn btn-primary w-full">Entra</button>
      </form>
    </main>
    </HrScope>
  );
}
