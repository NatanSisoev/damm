import type { ReactNode } from "react";
import { Wordmark } from "../../wordmark";

export { CompanyLabel } from "./company-label";

// Scope for the employee app: 16px text, 44px targets, 3px focus (.emp in globals.css).
// HR and manager pages never render this.
export function EmployeeFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`emp ${className}`}>{children}</div>;
}

// Flat page header: wordmark, optional eyebrow, title, lede, closed by a 1px rule.
export function PageHead({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line px-4 pb-6 pt-4">
      <Wordmark className="text-[15px]" />
      <div className="mt-8">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {lede && <p className="mt-3 max-w-sm text-muted">{lede}</p>}
      </div>
      {children}
    </header>
  );
}

export function LockIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mt-0.5 shrink-0"
    >
      <rect x="4" y="9" width="12" height="8" rx="1" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-muted">
      <LockIcon />
      <span>{children}</span>
    </p>
  );
}
