import { useId } from "react";

export function TextField({
  name,
  label,
  autoComplete,
  hint,
  mono = false,
  autoCapitalize = "none",
}: {
  name: string;
  label: string;
  autoComplete?: string;
  hint?: string;
  mono?: boolean;
  autoCapitalize?: "none" | "characters";
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required
        autoComplete={autoComplete ?? "off"}
        autoCapitalize={autoCapitalize}
        spellCheck={false}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`input ${mono ? "font-mono uppercase tracking-wider" : ""}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
