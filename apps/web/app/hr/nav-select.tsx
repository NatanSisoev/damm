"use client";

import { useRouter } from "next/navigation";

/** Dropdown whose options are full URLs built on the server, so changing it keeps every other filter. */
export function NavSelect({ label, options, value }: { label: string; options: { key: string; label: string; href: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] text-subtle">
      {label}
      <select
        className="input h-9 min-w-44"
        value={value}
        onChange={(e) => {
          const o = options.find((x) => x.key === e.target.value);
          if (o) router.push(o.href, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
