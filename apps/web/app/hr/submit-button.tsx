"use client";
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** Drop-in `<button>` for server-action forms: disabled and marked busy while the action runs, so a double click cannot fire it twice. */
export function SubmitButton({ disabled, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} disabled={disabled || pending} aria-busy={pending || undefined}>
      {children}
    </button>
  );
}
