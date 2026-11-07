import Link from "next/link";
import type { ReactNode } from "react";
import { EmployeeFrame } from "./frame";
import { Wordmark } from "../../wordmark";

// Shared frame for the employee pages: employee scope, centered column (phone-first, max width on PC),
// a header with 44px tap targets.
export function EmployeeShell({
  children,
  back,
  backHref = "/",
  backLabel = "Inici",
  title,
}: {
  children: ReactNode;
  back?: boolean;
  backHref?: string;
  backLabel?: string;
  title?: string;
}) {
  return (
    <EmployeeFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-8 pt-3 md:pt-8">
        <header className="mb-6 flex items-center justify-between gap-2">
          {back ? (
            <Link href={backHref} className="btn btn-ghost -ml-3 px-3 text-sm">
              ← {backLabel}
            </Link>
          ) : (
            <Link href="/" className="flex h-11 items-center">
              <Wordmark className="text-lg" />
            </Link>
          )}
          {title ? (
            <span className="text-sm font-bold text-muted">{title}</span>
          ) : (
            <Link href="/settings" className="btn btn-ghost -mr-3 px-3 text-sm">
              Configuració
            </Link>
          )}
        </header>
        {children}
      </main>
    </EmployeeFrame>
  );
}
