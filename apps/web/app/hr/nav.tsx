"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/hr", label: "Inici", step: "" },
  { href: "/hr/need", label: "Necessitat", step: "1" },
  { href: "/hr/review", label: "Revisió i publicació", step: "2" },
  { href: "/hr/results", label: "Resultats", step: "3" },
  { href: "/hr/recommendations", label: "Recomanacions", step: "4" },
];

export function HrNav() {
  const path = usePathname();
  return (
    <nav aria-label="Seccions" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {links.map((l) => {
        const active = l.href === "/hr" ? path === "/hr" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 shrink-0 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              active ? "bg-white/10 text-white" : "text-nav-ink hover:bg-white/5 hover:text-white"
            }`}
          >
            <span
              className={`grid size-5 place-items-center rounded-full text-[11px] num ${
                active ? "bg-accent text-white" : "bg-white/10 text-nav-ink"
              }`}
            >
              {l.step || (
                <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <path d="M2.5 7.5 8 3l5.5 4.5V13h-3.5V9.5H6V13H2.5z" />
                </svg>
              )}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
