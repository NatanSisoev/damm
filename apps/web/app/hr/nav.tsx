"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { hrDict, type HrKey } from "@/lib/i18n/hr";
import { LangSwitcher } from "@/components/lang-switcher";
import type { ViewRole } from "@/lib/view-role";
import { setViewRoleAction } from "./view-role-action";

export type NavBadges = { alarms?: { critical: number; total: number }; recommendations?: number };

type Item = { href: string; label: HrKey; icon: ReactNode };

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
  pool: svg(<><rect x="4" y="4" width="16" height="4" /><rect x="4" y="10" width="16" height="4" /><rect x="4" y="16" width="16" height="4" /></>),
  method: svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01" /></>),
  brain: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></>),
  comments: svg(<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>),
  settings: svg(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
};

const groups: { title: HrKey; items: Item[] }[] = [
  {
    title: "nav_ask",
    items: [
      { href: "/hr/brain", label: "nav_brain", icon: icons.brain },
      { href: "/hr/publish", label: "nav_publish", icon: icons.publish },
    ],
  },
  {
    title: "nav_listen",
    items: [
      { href: "/hr/pool", label: "nav_pool", icon: icons.pool },
      { href: "/hr/needs", label: "nav_needs", icon: icons.needs },
    ],
  },
  {
    title: "nav_understand",
    items: [
      { href: "/hr", label: "nav_home", icon: icons.home },
      { href: "/hr/signals", label: "nav_alarms", icon: icons.alarms },
      { href: "/hr/comments", label: "nav_comments", icon: icons.comments },
    ],
  },
];

const footer: Item[] = [
  { href: "/hr/methodology", label: "nav_method", icon: icons.method },
  { href: "/hr/settings", label: "nav_settings", icon: icons.settings },
];

/** Pages that live under a main item (results under Panell, recommendations under Alarmes). */
const alias: Record<string, string[]> = {
  "/hr": ["/hr/results"],
  "/hr/signals": ["/hr/recommendations"],
  "/hr/needs": ["/hr/need", "/hr/review"],
};

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

/** Testing toggle between the full HR portal and the dashboard-only manager view. */
function RoleToggle({ role, compact }: { role: ViewRole; compact: boolean }) {
  const t = useT(hrDict);
  return (
    <form action={setViewRoleAction} className="hr-role-toggle" data-compact={compact} aria-label={t("role_toggle")}>
      {(["hr", "manager"] as const).map((r) => (
        <button key={r} type="submit" name="role" value={r} aria-pressed={role === r} title={t(r === "hr" ? "role_hr" : "role_manager")}>
          {compact ? (r === "hr" ? "HR" : "M") : t(r === "hr" ? "role_hr" : "role_manager")}
        </button>
      ))}
    </form>
  );
}

export function HrSidebar({ badges, subtitle, logo, role = "hr" }: { badges?: NavBadges; subtitle: string; logo: ReactNode; role?: ViewRole }) {
  const path = usePathname();
  const t = useT(hrDict);
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
      return { n: badges.alarms.total, warn: badges.alarms.critical > 0, title: t("nav_critical", { n: badges.alarms.critical }), sr: t("nav_open_alarms") };
    if (href === "/hr/recommendations" && badges?.recommendations)
      return { n: badges.recommendations, warn: false, title: t("nav_pending_decision"), sr: t("nav_pending") };
    return null;
  };

  const renderItem = (l: Item, compact: boolean) => {
    const active = (l.href === "/hr" ? path === "/hr" : path.startsWith(l.href)) || (alias[l.href] ?? []).some((p) => path.startsWith(p));
    const b = badgeFor(l.href);
    const label = t(l.label);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        aria-label={compact ? `${label}${b ? `, ${b.n} ${b.sr}` : ""}` : undefined}
        title={compact ? label : undefined}
        className="hr-side-item"
      >
        <span className="hr-side-icon">{l.icon}</span>
        <span className="hr-side-label">{label}</span>
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
        {role === "manager"
          ? groups.flatMap((g) => g.items).filter((l) => l.href === "/hr").map((l) => renderItem(l, compact))
          : groups.map((g) => (
              <div key={g.title} className="hr-side-group">
                <p className="hr-side-title">{t(g.title)}</p>
                {g.items.map((l) => renderItem(l, compact))}
              </div>
            ))}
      </div>
      <div className="hr-side-foot">
        {footer.map((l) => renderItem(l, compact))}
        <RoleToggle role={role} compact={compact} />
      </div>
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
          aria-label={t("nav_open_menu")}
          aria-expanded={open}
          aria-controls="hr-drawer"
          onClick={() => setOpenAt(path)}
        >
          {svg(<path d="M4 7h16M4 12h16M4 17h16" />)}
        </button>
        <span className="flex items-center gap-3">{logo}</span>
        <span className="text-[12px] text-subtle">{subtitle}</span>
        <LangSwitcher className="ml-auto" />
      </div>
      {open && (
        <div className="hr-drawer-wrap">
          <div className="hr-scrim" onClick={close} aria-hidden="true" />
          <nav id="hr-drawer" ref={drawerRef} aria-label={t("sections")} role="dialog" aria-modal="true" className="hr-drawer">
            <div className="hr-drawer-head">
              <span className="text-[13px] font-bold">Escolta activa</span>
              <button type="button" className="hr-icon-btn" aria-label={t("nav_close_menu")} onClick={close}>
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
        <nav aria-label={t("sections")} className="hr-side-nav">
          {body(collapsed)}
        </nav>
        <button
          type="button"
          className="hr-side-toggle"
          onClick={toggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? t("nav_expand") : t("nav_collapse")}
          title={collapsed ? t("nav_expand_short") : t("nav_collapse_short")}
        >
          {svg(<path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />)}
          <span className="hr-side-label">{t("nav_collapse_short")}</span>
        </button>
      </aside>
    </>
  );
}
