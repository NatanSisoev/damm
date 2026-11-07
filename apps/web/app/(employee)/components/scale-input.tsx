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
  return (
    <div>
      <div role="radiogroup" aria-label="Valoració" className={`grid ${cols} gap-2`}>
        {values.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(v)}
              className={`num h-14 rounded-xl border text-lg font-semibold transition-colors ${
                on
                  ? "border-accent bg-accent text-white"
                  : "border-line-strong bg-surface text-ink active:bg-surface-muted"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs text-subtle">
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
