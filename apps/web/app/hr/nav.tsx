"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

export type NavBadges = { alarms?: { critical: number; total: number }; recommendations?: number };

type Item = { href: string; label: string; icon: ReactNode };

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const icons = {
  needs: svg(<><path d="M4 5h16v11H9l-5 4z" /></>),
  publish: svg(<><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h3v3m3 0v3h-3m-3 0v-3" /></>),
  home: svg(<><path d="M4 11l8-7 8 7v9H4z" /></>),
  results: svg(<><path d="M5 20V10m7 10V4m7 16v-7" /></>),
  alarms: svg(<><path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>),
  recs: svg(<><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0012 3z" /></>),
  method: svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01" /></>),
  brain: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></>),
  manager: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 5a3.5 3.5 0 010 6.5M18 14.5c2 .6 3.3 2.3 3.5 5.5" /></>),
};

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Escoltar",
    items: [
      { href: "/hr/needs", label: "Necessitats", icon: icons.needs },
      { href: "/hr/publish", label: "Enllaços i QR", icon: icons.publish },
    ],
  },
  {
    title: "Entendre",
    items: [
      { href: "/hr", label: "Inici", icon: icons.home },
      { href: "/hr/results", label: "Resultats", icon: icons.results },
      { href: "/hr/signals", label: "Alarmes", icon: icons.alarms },
    ],
  },
  { title: "Actuar", items: [{ href: "/hr/recommendations", label: "Recomanacions", icon: icons.recs }] },
];

const footer: Item[] = [
  { href: "/hr/brain", label: "Cervell", icon: icons.brain },
  { href: "/hr/methodology", label: "Com es calcula?", icon: icons.method },
  { href: "/manager", label: "Vista de responsables", icon: icons.manager },
];

const STORE = "hr-sidebar-collapsed";
function subscribe(cb: () => void) {
  window.addEventListener(STORE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(STORE, cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapsed() {
  try {
    return localStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
}
const FOCUSABLE = 'a[href],button:not([disabled])';

export function HrSidebar({ badges, subtitle, logo }: { badges?: NavBadges; subtitle: string; logo: ReactNode }) {
  const path = usePathname();
  // Collapsed state lives in localStorage (per viewer); server and first render use the expanded layout.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // The drawer is open only for the path it was opened on, so any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const drawerRef = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    try {
      localStorage.setItem(STORE, collapsed ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(STORE));
  };

  const close = useCallback(() => {
    setOpenAt(null);
    menuBtn.current?.focus();
  }, []);

  // Drawer: Esc closes, Tab is trapped, scroll locked, focus moves in.
  useEffect(() => {
    if (!open) return;
    const el = drawerRef.current;
    el?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const badgeFor = (href: string) => {
    if (href === "/hr/signals" && badges?.alarms && badges.alarms.total > 0)
      return { n: badges.alarms.total, warn: badges.alarms.critical > 0, title: `${badges.alarms.critical} crítiques`, sr: "alarmes obertes" };
    if (href === "/hr/recommendations" && badges?.recommendations)
      return { n: badges.recommendations, warn: false, title: "Pendents de decisió", sr: "pendents" };
    return null;
  };

  const renderItem = (l: Item, compact: boolean) => {
    const active = l.href === "/hr" ? path === "/hr" : path.startsWith(l.href);
    const b = badgeFor(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        aria-label={compact ? `${l.label}${b ? `, ${b.n} ${b.sr}` : ""}` : undefined}
        title={compact ? l.label : undefined}
        className="hr-side-item"
      >
        <span className="hr-side-icon">{l.icon}</span>
        <span className="hr-side-label">{l.label}</span>
        {b && (
          <span className={`badge num hr-side-badge ${b.warn ? "badge-warn" : ""}`} title={b.title}>
            {b.n}
          </span>
        )}
      </Link>
    );
  };

  const body = (compact: boolean) => (
    <>
      <div className="hr-side-scroll">
        {groups.map((g) => (
          <div key={g.title} className="hr-side-group">
            <p className="hr-side-title">{g.title}</p>
            {g.items.map((l) => renderItem(l, compact))}
          </div>
        ))}
      </div>
      <div className="hr-side-foot">{footer.map((l) => renderItem(l, compact))}</div>
    </>
  );

  return (
    <>
      {/* Below 1024px: slim top bar + drawer */}
      <div className="hr-topbar">
        <button
          ref={menuBtn}
          type="button"
          className="hr-icon-btn"
          aria-label="Obre el menú"
          aria-expanded={open}
          aria-controls="hr-drawer"
          onClick={() => setOpenAt(path)}
        >
          {svg(<path d="M4 7h16M4 12h16M4 17h16" />)}
        </button>
        <span className="flex items-center gap-3">{logo}</span>
        <span className="text-[12px] text-subtle">{subtitle}</span>
      </div>
      {open && (
        <div className="hr-drawer-wrap">
          <div className="hr-scrim" onClick={close} aria-hidden="true" />
          <nav id="hr-drawer" ref={drawerRef} aria-label="Seccions" role="dialog" aria-modal="true" className="hr-drawer">
            <div className="hr-drawer-head">
              <span className="text-[13px] font-bold">Escolta activa</span>
              <button type="button" className="hr-icon-btn" aria-label="Tanca el menú" onClick={close}>
                {svg(<path d="M6 6l12 12M18 6L6 18" />)}
              </button>
            </div>
            {body(false)}
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hr-sidebar" data-collapsed={collapsed}>
        <div className="hr-side-brand">
          {logo}
          {!collapsed && <span className="hr-side-sub">{subtitle}</span>}
        </div>
        <nav aria-label="Seccions" className="hr-side-nav">
          {body(collapsed)}
        </nav>
        <button
          type="button"
          className="hr-side-toggle"
          onClick={toggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Desplega la barra lateral" : "Replega la barra lateral"}
          title={collapsed ? "Desplega" : "Replega"}
        >
          {svg(<path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />)}
          <span className="hr-side-label">Replega</span>
        </button>
      </aside>
    </>
  );
}
