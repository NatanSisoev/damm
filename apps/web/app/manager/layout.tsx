import Link from "next/link";
import { DammLogo } from "../hr/damm-logo";

export const dynamic = "force-dynamic";

export default function ManagerLayout({ children }: LayoutProps<"/manager">) {
  return (
    <div className="min-h-screen">
      <header className="bg-nav px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/manager" className="flex items-center gap-3">
            <DammLogo className="h-6 w-auto shrink-0 text-white" />
            <span className="border-l border-white/15 pl-3 leading-tight">
              <span className="block text-[13px] font-semibold text-white">Escolta activa</span>
              <span className="block text-[11px] text-nav-muted">Vista de responsables</span>
            </span>
          </Link>
          <Link href="/hr" className="text-[13px] text-nav-ink hover:text-white">Portal de persones →</Link>
        </div>
      </header>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
