// Days are local calendar days ('YYYY-MM-DD') in the configured timezone.

const DAY_MS = 86_400_000;

export function dayOf(ms: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b later = positive). Accepts 'YYYY-MM-DD' or SQLite datetimes. */
export function daysBetween(a: string, b: string): number {
  return (toMs(b) - toMs(a)) / DAY_MS;
}

/** SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) or ISO → epoch ms. */
export function toMs(s: string): number {
  const iso = s.length === 10 ? `${s}T00:00:00Z` : s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/** Epoch ms → SQLite UTC datetime string, matching datetime('now'). */
export function toSqlDatetime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** 'YYYY-MM' → epoch ms of the first instant of the next month (UTC). */
export function periodEndMs(periode: string): number {
  const [y, m] = periode.split("-").map(Number) as [number, number];
  return Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
}
