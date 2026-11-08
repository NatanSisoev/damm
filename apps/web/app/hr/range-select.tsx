"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { hrDashboardDict } from "@/lib/i18n/hr-dashboard";

type Opt = { key: string; label: string; href: string };

/**
 * Interval dropdown. Presets navigate on change; "Custom" reveals two date inputs and an Apply button.
 * `base` is the dashboard URL without any interval (other filters kept), `from`/`to` the resolved current range.
 */
export function RangeSelect({ options, value, custom, base, from, to, min, max }: { options: Opt[]; value: string; custom: boolean; base: string; from: string; to: string; min?: string; max: string }) {
  const router = useRouter();
  const t = useT(hrDashboardDict);
  const [showCustom, setShowCustom] = useState(custom);
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const selected = showCustom ? "custom" : value;

  const apply = () => {
    if (!a || !b) return;
    const sep = base.includes("?") ? "&" : "?";
    router.push(`${base}${sep}from=${a}&to=${b}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <label className="flex items-center gap-2 text-subtle">
        {t("dash_interval")}
        <select
          className="input h-9 min-w-44"
          value={selected}
          onChange={(e) => {
            if (e.target.value === "custom") return setShowCustom(true);
            setShowCustom(false);
            const o = options.find((x) => x.key === e.target.value);
            if (o) router.push(o.href, { scroll: false });
          }}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
          <option value="custom">{t("dash_custom")}</option>
        </select>
      </label>
      {showCustom && (
        <>
          <label className="flex items-center gap-1.5 text-subtle">
            {t("dash_from")} <input type="date" value={a} min={min} max={max} onChange={(e) => setA(e.target.value)} className="input h-9" />
          </label>
          <label className="flex items-center gap-1.5 text-subtle">
            {t("dash_to")} <input type="date" value={b} min={min} max={max} onChange={(e) => setB(e.target.value)} className="input h-9" />
          </label>
          <button type="button" className="btn" onClick={apply} disabled={!a || !b}>{t("dash_apply")}</button>
        </>
      )}
    </div>
  );
}
