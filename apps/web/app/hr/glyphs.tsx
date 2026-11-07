import { MIN_GROUP_SIZE } from "@damm/shared";

/**
 * Compact, icon-first renderings of recurring facts, so pages show "👤 27" instead of "n=27".
 * Each one keeps the full Catalan wording in `title` and `aria-label`.
 */

const fmt = (n: number) => n.toLocaleString("ca-ES");

/** Number of respondents: "👤 27" (was "n=27"). */
export function People({ n }: { n: number | null | undefined }) {
  if (n === null || n === undefined) return <span className="glyph num">👤 —</span>;
  return (
    <span className="glyph num" title={`${fmt(n)} ${n === 1 ? "persona ha respost" : "persones han respost"}`} aria-label={`${fmt(n)} persones`}>
      <span aria-hidden>👤</span> {fmt(n)}
    </span>
  );
}

/** Number of comments: "💬 12". */
export function Comments({ n }: { n: number }) {
  return (
    <span className="glyph num" title={`${fmt(n)} comentaris`} aria-label={`${fmt(n)} comentaris`}>
      {fmt(n)} comentaris
    </span>
  );
}

/** Minimum group size: "👤 ≥10" (was "n ≥ 10"). */
export function MinPeople() {
  return (
    <span className="glyph num" title={`Cal un mínim de ${MIN_GROUP_SIZE} persones`} aria-label={`mínim ${MIN_GROUP_SIZE} persones`}>
      <span aria-hidden>👤</span> ≥{MIN_GROUP_SIZE}
    </span>
  );
}

/** Before and after sample sizes: "👤 24 → 31". */
export function PeopleRange({ from, to }: { from: number; to: number }) {
  return (
    <span className="glyph num" title={`${fmt(from)} persones abans, ${fmt(to)} després`} aria-label={`${fmt(from)} persones abans, ${fmt(to)} després`}>
      <span aria-hidden>👤</span> {fmt(from)} → {fmt(to)}
    </span>
  );
}
