import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { HrNav } from "./nav";

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-4 bg-nav px-3 py-3 md:sticky md:top-0 md:h-screen md:gap-6 md:py-5">
        <Link href="/hr" className="flex items-center gap-2.5 px-2">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent text-sm text-white">★</span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold text-white">Escolta activa</span>
            <span className="block text-[11px] text-nav-muted">Portal de persones</span>
          </span>
        </Link>
        <HrNav />
        <div className="mt-auto hidden space-y-2 rounded-lg border border-white/10 p-3 text-[11px] leading-4 text-nav-muted md:block">
          <p><span className="text-nav-ink">Dades sintètiques.</span> Cap resposta individual.</p>
          <p>Grups de menys de {MIN_GROUP_SIZE} persones suprimits.</p>
          <p>La IA proposa, una persona decideix.</p>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
