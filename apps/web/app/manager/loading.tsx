/** Shown while a manager page renders on the server. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-56 rounded bg-line" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-line" />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>
      <div className="card">
        <div className="card-body space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 rounded bg-line" />
          ))}
        </div>
      </div>
    </div>
  );
}
