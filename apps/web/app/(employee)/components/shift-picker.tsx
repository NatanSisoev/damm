"use client";

import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

export interface ShiftChoice {
  value: string;
  label: string;
}

/**
 * Optional shift question (onboarding and settings). Submits `torn` ("" = prefer not to say).
 * The shift only feeds the "do we reach every shift?" check; it is never shown per person.
 */
export function ShiftPicker({ options, current = "" }: { options: ShiftChoice[]; current?: string }) {
  const t = useT(employeeDict);
  const all: ShiftChoice[] = [...options, { value: "", label: t("shift_skip") }];
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{t("shift_title")}</legend>
      <p className="text-sm text-muted">{t("shift_privacy")}</p>
      <div className="grid gap-2">
        {all.map((o) => (
          <label
            key={o.value || "skip"}
            className="flex min-h-12 cursor-pointer items-center gap-3 border border-line px-3 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
          >
            <input type="radio" name="torn" value={o.value} defaultChecked={o.value === current} className="size-4 accent-[var(--accent)]" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
