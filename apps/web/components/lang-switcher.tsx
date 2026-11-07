"use client";
// Three-way language switcher (ca / es / en). Works on every surface; sets the cookie via a server action.
import { useTransition } from "react";
import { LANGS, LANG_LABELS } from "@damm/shared";
import { setLanguageAction } from "@/app/lang-actions";
import { useLang, useT } from "@/lib/i18n/client";
import { commonDict } from "@/lib/i18n/common";

export function LangSwitcher({ className = "" }: { className?: string }) {
  const lang = useLang();
  const t = useT(commonDict);
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("language")} className={`inline-flex gap-1 ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === lang}
          disabled={pending}
          onClick={() => start(() => setLanguageAction(l))}
          className={`min-h-9 min-w-9 rounded-sm border px-2 text-sm font-medium ${
            l === lang ? "border-current font-bold underline underline-offset-4" : "border-transparent opacity-70"
          }`}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
