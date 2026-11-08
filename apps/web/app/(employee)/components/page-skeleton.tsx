/** Shared loading skeleton for employee routes (server-rendered pages). */
export function EmployeePageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="emp mx-auto max-w-md animate-pulse px-4 py-6">
      <div className="h-4 w-32 rounded bg-line" />
      <div className="mt-4 h-8 w-64 max-w-full rounded bg-line" />
      <div className="mt-3 h-4 w-full rounded bg-line" />
      <div className="mt-8 space-y-4">
        <div className="h-12 rounded bg-line" />
        <div className="h-12 rounded bg-line" />
        <div className="h-14 rounded bg-line" />
      </div>
    </div>
  );
}
