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
    <select
      aria-label={t("language")}
      value={lang}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Lang;
        start(() => setLanguageAction(next));
      }}
      className={`min-h-9 rounded-sm border border-current bg-transparent px-2 text-sm font-medium ${className}`}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value} lang={o.value} title={LANG_LABELS[o.value]}>
          {o.short}
        </option>
      ))}
    </select>
  );
}
