"use client";

import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

export const OPEN_MAX = 500;

export function OpenInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT(employeeDict);
  return (
    <div>
      <label htmlFor="obert" className="label">
        {t("open_label")}
      </label>
      <textarea
        id="obert"
        className="input w-full text-base"
        rows={6}
        maxLength={OPEN_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("open_placeholder")}
      />
      <div className="mt-1 flex justify-between text-sm text-muted">
        <span>{t("open_note")}</span>
        <span className="num">
          {value.length}/{OPEN_MAX}
        </span>
      </div>
    </div>
  );
}
