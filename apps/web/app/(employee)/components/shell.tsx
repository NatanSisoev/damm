import Link from "next/link";
import type { ReactNode } from "react";

// Shared frame for the employee pages: centered column (phone-first, max width on PC), a header
// with 44px tap targets and the same card/btn language as the HR side.
export function EmployeeShell({
  children,
  back,
  title,
}: {
  children: ReactNode;
  back?: boolean;
  title?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-8 pt-3 md:pt-8">
      <header className="mb-6 flex items-center justify-between gap-2">
        {back ? (
          <Link href="/" className="btn btn-ghost -ml-3 h-11 px-3 text-sm">
            ← Inici
          </Link>
        ) : (
          <Link href="/" className="flex h-11 items-center text-base font-semibold tracking-tight">
            Escolta activa
          </Link>
        )}
        {title ? (
          <span className="text-sm font-medium text-muted">{title}</span>
        ) : (
          <Link href="/settings" className="btn btn-ghost -mr-3 h-11 px-3 text-sm">
            Configuració
          </Link>
        )}
      </header>
      {children}
    </main>
  );
}
