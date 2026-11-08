"use client";
// Two-state light/dark toggle. Flips to the opposite of what is shown now (light is the default),
// applies instantly via data-theme on <html>, and stores the choice in a cookie read by the root layout.
import { useT } from "@/lib/i18n/client";
import { themeDict } from "@/lib/i18n/theme";

const COOKIE = "damm_theme";
const META: Record<"light" | "dark", string> = { light: "#fafaf8", dark: "#0f0f0e" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useT(themeDict);
  const flip = () => {
    const root = document.documentElement;
    const shown = root.dataset.theme === "dark" ? "dark" : "light";
    const next = shown === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    // Browser chrome colour follows the forced theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute("media");
      m.content = META[next];
    });
  };
  return (
    <button type="button" onClick={flip} className={`theme-toggle ${className}`} aria-label={t("theme_toggle")} title={t("theme_toggle")}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="ti-moon" d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
        <g className="ti-sun">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </g>
      </svg>
    </button>
  );
}
