import type { ReactNode } from "react";
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { LangSwitcher } from "@/components/lang-switcher";
import { Wordmark } from "../wordmark";
import { HrSidebar, type NavBadges } from "./nav";
import type { ViewRole } from "@/lib/view-role";
import "./hr.css";

/** Theme scope only (no chrome), for pages outside the HR layout such as the login. */
export function HrScope({ children }: { children: ReactNode }) {
  return <div className={`hr-shell flex min-h-screen flex-col`}>{children}</div>;
}

export type { NavBadges };

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
export async function HrShell({ children, subtitle, manager = false, badges, role = "hr" }: { children: ReactNode; subtitle?: string; manager?: boolean; badges?: NavBadges; role?: ViewRole }) {
  const t = await getT(hrDict);
  subtitle ??= t("shell_subtitle");
  if (manager) {
    return (
      <div className={`hr-shell flex min-h-screen flex-col`}>
        <header className="hr-bar">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 md:px-8">
            <Link href="/manager" className="flex h-12 items-center gap-3">
              <Wordmark className="h-5" />
              <span className="border-l border-line pl-3 text-[11px] text-subtle">{subtitle}</span>
            </Link>
            <nav aria-label={t("sections")} className="ml-auto flex items-center gap-4">
              <LangSwitcher />
              <Link href="/hr" className="hr-tab">{t("manager_to_portal")}</Link>
            </nav>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <Footer />
      </div>
    );
  }
  return (
    <div className={`hr-shell hr-layout`} data-role={role}>
      <HrSidebar
        role={role}
        badges={badges}
        subtitle={subtitle}
        logo={
          <Link href="/hr" aria-label={t("logo_aria")} className="flex items-center">
            <Wordmark className="h-5" />
          </Link>
        }
      />
      <div className="hr-content flex min-w-0 flex-col">
        {/* Desktop: language chooser top right (below 1024px it sits in the top bar) */}
        <div className="hr-lang-top hidden justify-end px-4 pt-4 md:px-8 lg:flex">
          <LangSwitcher />
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
