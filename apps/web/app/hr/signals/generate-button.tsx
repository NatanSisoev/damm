"use client";

import { useFormStatus } from "react-dom";

const Sparkle = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="gen-icon" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
    <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" />
  </svg>
);

/** Submit button for "draft recommendations": shows progress while the server action runs. */
export function GenerateButton({ variant = "inline" }: { variant?: "inline" | "panel" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={variant === "panel" ? "btn btn-primary gen-btn gen-btn-lg" : "btn gen-btn"}>
      {pending ? <span className="gen-spinner" aria-hidden /> : <Sparkle />}
      {pending ? "Generant…" : "Genera recomanacions"}
    </button>
  );
}
