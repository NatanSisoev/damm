"use client";
// Language dropdown (EN / ES / CAT). Works on every surface; sets the cookie via a server action.
import { useTransition } from "react";
import { LANG_LABELS, type Lang } from "@damm/shared";
import { setLanguageAction } from "@/app/lang-actions";
import { useLang, useT } from "@/lib/i18n/client";
import { commonDict } from "@/lib/i18n/common";

const OPTIONS: { value: Lang; short: string }[] = [
  { value: "en", short: "EN" },
  { value: "es", short: "ES" },
  { value: "ca", short: "CAT" },
];

export function LangSwitcher({ className = "" }: { className?: string }) {
  const lang = useLang();
  const t = useT(commonDict);
  const [pending, start] = useTransition();
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        aria-label={t("language")}
        value={lang}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Lang;
          start(() => setLanguageAction(next));
        }}
        className="min-h-9 cursor-pointer appearance-none border-0 bg-transparent pr-4 pl-0 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} lang={o.value} title={LANG_LABELS[o.value]}>
            {o.short}
          </option>
        ))}
      </select>
      <svg aria-hidden="true" viewBox="0 0 10 6" width="9" height="6" className="pointer-events-none absolute right-0.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 1l4 4 4-4" />
      </svg>
    </span>
  );
}
