import type { ReactNode } from "react";
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { Wordmark } from "../wordmark";
import { HrSidebar, type NavBadges } from "./nav";
import "./hr.css";

/** Theme scope only (no chrome), for pages outside the HR layout such as the login. */
export function HrScope({ children }: { children: ReactNode }) {
  return <div className={`hr-shell flex min-h-screen flex-col`}>{children}</div>;
}

export type { NavBadges };

const Footer = () => (
  <footer className="border-t border-line px-4 py-4 text-[12px] text-subtle md:px-8">
    <p className="mx-auto max-w-6xl">
      Dades sintètiques. Cap resposta individual. Grups de menys de {MIN_GROUP_SIZE} persones suprimits. La IA proposa, una persona decideix.
    </p>
  </footer>
);

/**
 * Shared chrome. /hr gets a grouped sidebar (drawer below 1024px); /manager keeps the neutral top bar.
 * Red only on the active nav item.
 */
export function HrShell({ children, subtitle = "Portal de persones", manager = false, badges }: { children: ReactNode; subtitle?: string; manager?: boolean; badges?: NavBadges }) {
  if (manager) {
    return (
      <div className={`hr-shell flex min-h-screen flex-col`}>
        <header className="hr-bar">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 md:px-8">
            <Link href="/manager" className="flex h-12 items-center gap-3">
              <Wordmark className="text-[15px]" />
              <span className="border-l border-line pl-3 text-[11px] text-subtle">{subtitle}</span>
            </Link>
            <nav aria-label="Seccions" className="ml-auto">
              <Link href="/hr" className="hr-tab">Portal de persones →</Link>
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
    <div className={`hr-shell hr-layout`}>
      <HrSidebar
        badges={badges}
        subtitle={subtitle}
        logo={
          <Link href="/hr" aria-label="Escolta activa, inici" className="flex items-center">
            <Wordmark className="text-[15px]" />
          </Link>
        }
      />
      <div className="hr-content flex min-w-0 flex-col">
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
