// Short-lived memo for HR read-only aggregates. Dashboard, pool detail and comment pages recompute the same view scans on every
// navigation (the analytics view is scanned several times per render). The result only changes when answers arrive or a job runs,
// so a few seconds of reuse is invisible to the user and makes revisits and filter clicks instant.
// Aggregates only: nothing per person is ever stored here. Actions that change HR state call invalidateHrMemo().

type Entry = { at: number; value: unknown };
const g = globalThis as { __hrMemo?: Map<string, Entry> };
const store = () => (g.__hrMemo ??= new Map<string, Entry>());

export const HR_MEMO_TTL_MS = 15_000;
const MAX_ENTRIES = 200;

export function memo<T>(name: string, args: unknown, fn: () => T, ttlMs = HR_MEMO_TTL_MS): T {
  const m = store();
  const key = `${name}|${JSON.stringify(args ?? null)}`;
  const hit = m.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = fn();
  if (m.size >= MAX_ENTRIES) m.delete(m.keys().next().value as string);
  m.set(key, { at: now, value });
  return value;
}

export function invalidateHrMemo(): void {
  store().clear();
}
