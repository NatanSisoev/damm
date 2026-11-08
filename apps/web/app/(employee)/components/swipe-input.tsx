"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

// swipe: drag the card right for "Sí" (1) or left for "No" (0). Two buttons do the same for
// people who do not swipe (and for keyboard and screen-reader use).
const THRESHOLD = 80;

export function SwipeInput({
  text,
  value,
  onChange,
}: {
  text: string;
  value: number | null;
  onChange: (v: 0 | 1) => void;
}) {
  const t = useT(employeeDict);
  const [dx, setDx] = useState(0);
  const [start, setStart] = useState<number | null>(null);

  const end = () => {
    if (start === null) return;
    if (dx > THRESHOLD) onChange(1);
    else if (dx < -THRESHOLD) onChange(0);
    setStart(null);
    setDx(0);
  };

  const tint = dx > 20 ? "border-good" : dx < -20 ? "border-accent" : "border-line-strong";

  return (
    <div>
      <div
        className={`card touch-pan-y select-none px-5 py-10 text-center text-lg font-semibold ${tint}`}
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 20}deg)`,
          transition: start === null ? "transform 200ms var(--ease)" : "none",
        }}
        onPointerDown={(e) => {
          setStart(e.clientX);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start !== null) setDx(e.clientX - start);
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          setStart(null);
          setDx(0);
        }}
      >
        {text}
        <p className="mt-3 text-sm font-normal text-muted">{t("swipe_hint")}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("swipe_answer")}>
        <button
          type="button"
          role="radio"
          aria-checked={value === 0}
          onClick={() => onChange(0)}
          className={`h-14 rounded-xl border text-base font-semibold ${
            value === 0 ? "border-accent bg-accent text-[color:var(--on-accent)]" : "border-line-strong bg-surface text-ink"
          }`}
        >
          {t("no")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 1}
          onClick={() => onChange(1)}
          className={`h-14 rounded-xl border text-base font-semibold ${
            value === 1 ? "border-good bg-good text-[color:var(--on-accent)]" : "border-line-strong bg-surface text-ink"
          }`}
        >
          {t("yes")}
        </button>
      </div>
    </div>
  );
}
