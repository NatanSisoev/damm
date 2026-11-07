"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Labels match each page's own title.
const links = [
  { href: "/hr", label: "Inici" },
  { href: "/hr/needs", label: "Necessitats" },
  { href: "/hr/publish", label: "Enllaços i QR" },
  { href: "/hr/results", label: "Resultats" },
  { href: "/hr/recommendations", label: "Recomanacions" },
  { href: "/hr/methodology", label: "Com es calcula?" },
  { href: "/manager", label: "Vista de responsables" },
];

export function HrNav() {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways: keep the active one in view.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [path]);
  return (
    <nav ref={ref} aria-label="Seccions" className="-mx-4 flex min-w-0 basis-full gap-5 overflow-x-auto px-4 md:mx-0 md:basis-auto md:flex-1 md:px-0 [scrollbar-width:none]">
      {links.map((l) => {
        const active = l.href === "/hr" ? path === "/hr" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className="hr-tab shrink-0">
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
