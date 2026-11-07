// Edge cases for the Europe/Madrid day: `pnpm --filter @damm/db run madrid-check`.
import assert from "node:assert/strict";
import { madridDay } from "../src/madrid-day";

const d = (iso: string) => madridDay(new Date(iso));

// Winter (UTC+1): 23:30 Madrid on 14 Jan is 22:30Z, still the 14th (UTC agrees).
assert.equal(d("2026-01-14T22:30:00Z").dia, "2026-01-14");
// 00:30 Madrid on 15 Jan is 23:30Z on the 14th: UTC says the 14th, Madrid says the 15th.
assert.equal(d("2026-01-14T23:30:00Z").dia, "2026-01-15");
// Summer (UTC+2): 23:30 Madrid on 14 Jul is 21:30Z; 00:30 on 15 Jul is 22:30Z on the 14th.
assert.equal(d("2026-07-14T21:30:00Z").dia, "2026-07-14");
assert.equal(d("2026-07-14T22:30:00Z").dia, "2026-07-15");

// DST start 2026-03-29 (02:00 -> 03:00 Madrid). Day is 23 hours long.
assert.equal(d("2026-03-28T22:30:00Z").dia, "2026-03-28"); // 23:30 CET on the 28th
assert.equal(d("2026-03-28T23:30:00Z").dia, "2026-03-29"); // 00:30 CET on the 29th
const start = d("2026-03-29T12:00:00Z");
assert.equal(start.startUtc, "2026-03-28 23:00:00");
assert.equal(start.endUtc, "2026-03-29 22:00:00"); // midnight CEST = 22:00Z
assert.equal(d("2026-03-29T21:30:00Z").dia, "2026-03-29"); // 23:30 CEST
assert.equal(d("2026-03-29T22:30:00Z").dia, "2026-03-30"); // 00:30 CEST on the 30th

// DST end 2026-10-25 (03:00 -> 02:00 Madrid). Day is 25 hours long.
assert.equal(d("2026-10-24T21:30:00Z").dia, "2026-10-24"); // 23:30 CEST
assert.equal(d("2026-10-24T22:30:00Z").dia, "2026-10-25"); // 00:30 CEST on the 25th
const end = d("2026-10-25T12:00:00Z");
assert.equal(end.startUtc, "2026-10-24 22:00:00");
assert.equal(end.endUtc, "2026-10-25 23:00:00");
assert.equal(d("2026-10-25T22:30:00Z").dia, "2026-10-25"); // 23:30 CET
assert.equal(d("2026-10-25T23:30:00Z").dia, "2026-10-26"); // 00:30 CET on the 26th

// Month boundary follows Madrid too: 00:30 Madrid on 1 Nov is 23:30Z on 31 Oct.
assert.equal(d("2026-10-31T23:30:00Z").periode, "2026-11");
assert.equal(d("2026-10-31T22:30:00Z").periode, "2026-10");

// Bounds are consistent: an instant is inside its own day's [start, end).
for (const iso of ["2026-03-29T00:10:00Z", "2026-10-25T01:59:00Z", "2026-12-31T23:59:00Z"]) {
  const x = d(iso);
  const t = iso.slice(0, 19).replace("T", " ");
  assert.ok(t >= x.startUtc && t < x.endUtc, iso);
}
console.log("madrid-day: ok");
