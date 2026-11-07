// "Today" for the employee flow follows Europe/Madrid, not UTC. Pure module, no DB access.
// `resposta.data` is stored in UTC (SQLite datetime('now')), so day checks compare against the
// UTC bounds of the Madrid day instead of using date(data).

const TZ = "Europe/Madrid";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function parts(ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute, s: o.second };
}

/** Madrid offset from UTC at an instant, in ms (+1h winter, +2h summer). */
function offsetMs(ms: number): number {
  const p = parts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of 00:00 Madrid time on the given calendar date. */
function madridMidnightUtc(y: number, mo: number, d: number): number {
  const naive = Date.UTC(y, mo - 1, d);
  const guess = naive - offsetMs(naive - 3600_000);
  return naive - offsetMs(guess);
}

function sqliteUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export type MadridDay = {
  /** `YYYY-MM-DD` in Madrid time. */
  dia: string;
  /** `YYYY-MM` in Madrid time. */
  periode: string;
  /** Inclusive start of the Madrid day, UTC, as SQLite `YYYY-MM-DD HH:MM:SS`. */
  startUtc: string;
  /** Exclusive end of the Madrid day, UTC, same format. */
  endUtc: string;
};

export function madridDay(now: Date = new Date()): MadridDay {
  const p = parts(now.getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1));
  return {
    dia: `${p.y}-${pad(p.mo)}-${pad(p.d)}`,
    periode: `${p.y}-${pad(p.mo)}`,
    startUtc: sqliteUtc(madridMidnightUtc(p.y, p.mo, p.d)),
    endUtc: sqliteUtc(madridMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())),
  };
}
