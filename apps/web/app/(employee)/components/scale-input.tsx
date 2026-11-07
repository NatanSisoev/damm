"use client";

// scale5 and scale10: large tap targets, extremes labelled.
export function ScaleInput({
  max,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  max: 5 | 10;
  value: number | null;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const values = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Valoració"
        className="grid grid-cols-5 gap-2"
      >
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
      <div className="mt-2 flex justify-between text-xs text-subtle">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
