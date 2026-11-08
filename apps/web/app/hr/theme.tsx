import type { ReactNode } from "react";
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { Wordmark } from "../wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { HrSidebar } from "./nav";
import type { ViewRole } from "@/lib/view-role";
import "./hr.css";

/** Theme scope only (no chrome), for pages outside the HR layout such as the login. */
export function HrScope({ children }: { children: ReactNode }) {
  return <div className={`hr-shell flex min-h-screen flex-col`}>{children}</div>;
}

async function Footer() {
  const t = await getT(hrDict);
  return (
    <footer className="border-t border-line px-4 py-4 text-[12px] text-subtle md:px-8">
      <p className="mx-auto max-w-6xl">{t("footer", { n: MIN_GROUP_SIZE })}</p>
    </footer>
  );
}

/**
 * Shared chrome. /hr gets a grouped sidebar (drawer below 1024px); /manager keeps the neutral top bar.
 * Red only on the active nav item.
 */
export async function HrShell({ children, subtitle, manager = false, role = "hr" }: { children: ReactNode; subtitle?: string; manager?: boolean; role?: ViewRole }) {
  const t = await getT(hrDict);
  subtitle ??= t("shell_subtitle");
  if (manager) {
    return (
      <div className={`hr-shell flex min-h-screen flex-col`}>
        <a href="#main" className="hr-skip">{t("skip_to_content")}</a>
        <header className="hr-bar">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 md:px-8">
            <Link href="/manager" className="flex h-12 items-center gap-3">
              <Wordmark className="h-4" />
              <span className="border-l border-line pl-3 text-[11px] text-subtle">{subtitle}</span>
            </Link>
            <nav aria-label={t("sections")} className="ml-auto flex items-center gap-4">
              <Link href="/hr" className="hr-tab">{t("manager_to_portal")}</Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <Footer />
      </div>
    );
  }
  return (
    <div className={`hr-shell hr-layout`} data-role={role}>
      <a href="#main" className="hr-skip">{t("skip_to_content")}</a>
      <HrSidebar
        role={role}
        subtitle={subtitle}
        logo={
          <Link href="/hr" aria-label={t("logo_aria")} className="flex items-center">
            <Wordmark className="h-4" />
          </Link>
        }
      />
      <div className="hr-content flex min-w-0 flex-col">
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
