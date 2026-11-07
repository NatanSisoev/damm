import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { HrNav } from "./nav";
import { DammLogo } from "./damm-logo";
import { hrAlarmCounts } from "@/lib/hr-engine";

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  const counts = hrAlarmCounts();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-4 bg-nav px-3 py-3 md:sticky md:top-0 md:h-screen md:gap-6 md:py-5">
        <Link href="/hr" className="flex items-center gap-3 px-2 md:flex-col md:items-start md:gap-2.5">
          <DammLogo className="h-6 w-auto shrink-0 text-white md:h-7" />
          <span className="border-l border-white/15 pl-3 leading-tight md:border-l-0 md:border-t md:pt-2.5 md:pl-0 md:w-full">
            <span className="block text-[13px] font-semibold text-white">Escolta activa</span>
            <span className="block text-[11px] text-nav-muted">Portal de persones</span>
          </span>
        </Link>
        <HrNav alarms={{ critical: counts.critical, warning: counts.warning, total: counts.critical + counts.warning + counts.info }} />
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
