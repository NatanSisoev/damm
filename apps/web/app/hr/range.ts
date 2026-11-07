// Date-range presets for the dashboard. Pure date maths on ISO days (UTC), no clock reads except `today`.
import type { DateWindow, WindowBucket } from "@damm/db/hr";

export const PRESETS = [
  { key: "today", label: "Avui" },
  { key: "week", label: "Aquesta setmana" },
  { key: "lastweek", label: "Setmana passada" },
  { key: "30d", label: "30 dies" },
  { key: "month", label: "Aquest mes" },
  { key: "lastmonth", label: "Mes passat" },
  { key: "year", label: "Aquest any" },
  { key: "all", label: "Tot" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"] | "custom";

const DAY = 86_400_000;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, days: number) => iso(new Date(parse(s).getTime() + days * DAY));
const mondayOf = (s: string) => add(s, -((parse(s).getUTCDay() + 6) % 7));
const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

export const spanDays = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY) + 1;
export const fmtDay = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export function bucketFor(from: string, to: string): WindowBucket {
  const n = spanDays(from, to);
  return n <= 14 ? "day" : n <= 120 ? "week" : "month";
}

/**
 * Resolve the query into a window. "Today" is the real day, but never later than the last day with data
 * (otherwise every preset would be empty on a demo database whose answers stop in the past).
 */
export function resolveRange(
  q: { r?: string; from?: string; to?: string },
  bounds: { min: string | null; max: string | null },
  realToday: string,
): { key: PresetKey; from: string; to: string; anchor: string; anchored: boolean } {
  const anchor = bounds.max && bounds.max < realToday ? bounds.max : realToday;
  const lo = bounds.min ?? anchor;
  const y = anchor.slice(0, 4), m = anchor.slice(0, 7);
  const monthStart = `${m}-01`;
  const prevMonthEnd = add(monthStart, -1);
  let key: PresetKey = PRESETS.some((p) => p.key === q.r) ? (q.r as PresetKey) : "all";
  let from = lo, to = anchor;
  if (isIso(q.from) && isIso(q.to)) {
    key = "custom";
    [from, to] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from];
  } else {
    switch (key) {
      case "today": from = anchor; break;
      case "week": from = mondayOf(anchor); break;
      case "lastweek": from = add(mondayOf(anchor), -7); to = add(mondayOf(anchor), -1); break;
      case "30d": from = add(anchor, -29); break;
      case "month": from = monthStart; break;
      case "lastmonth": from = `${prevMonthEnd.slice(0, 7)}-01`; to = prevMonthEnd; break;
      case "year": from = `${y}-01-01`; break;
      default: key = "all";
    }
  }
  return { key, from, to, anchor, anchored: anchor !== realToday };
}

/** The window of the same length right before this one (null for "Tot", which has nothing before it). */
export function previousWindow(from: string, to: string, lo: string | null): { from: string; to: string } | null {
  const n = spanDays(from, to);
  const pTo = add(from, -1);
  const pFrom = add(pTo, -(n - 1));
  return lo && pTo < lo ? null : { from: pFrom, to: pTo };
}

export type { DateWindow };
