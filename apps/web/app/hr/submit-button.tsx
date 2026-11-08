"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** For slow actions (AI drafting): a rotating icon and this label replace the content while the action runs. */
  busyLabel?: ReactNode;
};

/** Drop-in `<button>` for server-action forms: disabled and marked busy while the action runs, so a double click cannot fire it twice. */
export function SubmitButton({ disabled, children, busyLabel, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && busyLabel ? <span className="inline-flex items-center gap-2"><span className="gen-spinner" aria-hidden />{busyLabel}</span> : children}
    </button>
  );
}
