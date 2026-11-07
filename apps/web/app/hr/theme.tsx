import type { ReactNode } from "react";
import Link from "next/link";
import { Hanken_Grotesk } from "next/font/google";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { DammLogo } from "./damm-logo";
import { HrSidebar, type NavBadges } from "./nav";
import "./hr.css";

const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], weight: ["400", "500", "700", "800"] });

/** Theme scope only (no chrome), for pages outside the HR layout such as the login. */
export function HrScope({ children }: { children: ReactNode }) {
  return <div className={`hr-shell ${hanken.variable} flex min-h-screen flex-col`}>{children}</div>;
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
      <div className={`hr-shell ${hanken.variable} flex flex-col`}>
        <header className="hr-bar">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 md:px-8">
            <Link href="/manager" className="flex h-12 items-center gap-3">
              <DammLogo className="h-5 w-auto shrink-0 text-ink" />
              <span className="border-l border-line pl-3 leading-tight">
                <span className="block text-[13px] font-bold">Escolta activa</span>
                <span className="block text-[11px] text-subtle">{subtitle}</span>
              </span>
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
    <div className={`hr-shell hr-layout ${hanken.variable}`}>
      <HrSidebar
        badges={badges}
        subtitle={subtitle}
        logo={
          <Link href="/hr" aria-label="Escolta activa, inici" className="flex items-center">
            <DammLogo className="h-5 w-auto shrink-0 text-ink" />
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
