"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

export const MIN_PASSWORD = 8;

// Password input with a show/hide toggle and an inline minimum-length hint (shown before submit).
export function PasswordField({
  name,
  label,
  autoComplete,
  showHint = false,
  minLength,
}: {
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password";
  showHint?: boolean;
  minLength?: number;
}) {
  const t = useT(employeeDict);
  const id = useId();
  const [shown, setShown] = useState(false);
  const [len, setLen] = useState(0);
  const short = showHint && len > 0 && len < MIN_PASSWORD;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={showHint ? `${id}-hint` : undefined}
          onChange={(e) => setLen(e.target.value.length)}
          className="input pr-24"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 flex h-11 min-w-20 -translate-y-1/2 items-center justify-center rounded-lg px-3 text-sm font-bold text-muted hover:text-ink"
        >
          {shown ? t("password_hide") : t("password_show")}
          <span className="sr-only">{t("password_sr_suffix")}</span>
        </button>
      </div>
      {showHint && (
        <p id={`${id}-hint`} className={`mt-1 text-sm ${short ? "text-warn font-semibold" : "text-muted"}`}>
          {t("password_hint_min", { min: MIN_PASSWORD })}
          {len > 0 ? ` (${len}/${MIN_PASSWORD}${len >= MIN_PASSWORD ? " ✓" : ""})` : ""}.
        </p>
      )}
    </div>
  );
}
