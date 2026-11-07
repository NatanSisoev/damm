"use client";

// scale5 (1..5) and scale10 (0..10): large tap targets, extremes labelled.
// scale10 has 11 values, so it wraps into two rows of 6 to keep 44px+ targets on a 375px phone.
export function ScaleInput({
  min = 1,
  max,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  min?: 0 | 1;
  max: 5 | 10;
  value: number | null;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const cols = max === 10 ? "grid-cols-6" : "grid-cols-5";
  // Accessible name per tile: "3 de 5, Neutral"; the two ends carry the question's own anchors.
  const nameFor = (v: number) => {
    const base = `${v} de ${max}`;
    if (v === min) return `${base}, ${lowLabel}`;
    if (v === max) return `${base}, ${highLabel}`;
    if (max === 5 && v === 3) return `${base}, Neutral`;
    return base;
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Valoració" className={`tiles grid ${cols} gap-2`}>
        {values.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={nameFor(v)}
              onClick={() => onChange(v)}
              className={`num ${max === 10 ? "!min-h-14 !text-xl" : ""}`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-sm text-muted">
        <span className="max-w-[45%]">
          {min} · {lowLabel}
        </span>
        <span className="max-w-[45%] text-right">
          {max} · {highLabel}
        </span>
      </div>
    </div>
  );
}
