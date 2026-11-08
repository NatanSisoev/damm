import { MIN_GROUP_SIZE } from "@damm/shared";
import { getTL } from "@/lib/i18n/server";
import { panelDict } from "@/lib/i18n/hr-panel";
import { numD } from "@/lib/i18n/num";

/**
 * Compact, icon-first renderings of recurring facts, so pages show "👤 27" instead of "n=27".
 * Each one keeps the full wording (in the UI language) in `title` and `aria-label`.
 */

/**
 * Number of respondents: "👤 27" (was "n=27"). Same rule as `nLabel` (B3, R-PRIV-2): rows scoped to a collective or shift show only
 * "👤 ≥10", never the exact count that could expose a suppressed sibling. A string is an already formatted count (`shownCount`).
 */
export async function People({ n, scoped = false }: { n: number | string | null | undefined; scoped?: boolean }) {
  const { t, lang } = await getTL(panelDict);
  const fmt = (v: number) => numD(v, lang, 0);
  if (n === null || n === undefined) return <span className="glyph num">👤 —</span>;
  if (typeof n === "string") return <span className="glyph num" title={t("g_people_title")} aria-label={t("g_people_aria", { n })}><span aria-hidden>👤</span> {n}</span>;
  if (scoped) {
    return (
      <span className="glyph num" title={t("g_min_title", { min: MIN_GROUP_SIZE })} aria-label={t("g_min_aria", { min: MIN_GROUP_SIZE })}>
        <span aria-hidden>👤</span> ≥{MIN_GROUP_SIZE}
      </span>
    );
  }
  return (
    <span className="glyph num" title={t(n === 1 ? "g_person_one" : "g_person_other", { n: fmt(n) })} aria-label={t("g_people_aria", { n: fmt(n) })}>
      <span aria-hidden>👤</span> {fmt(n)}
    </span>
  );
}

/** Number of comments: "💬 12". */
export async function Comments({ n }: { n: number }) {
  const { t, lang } = await getTL(panelDict);
  const label = t("g_comments", { n: numD(n, lang, 0) });
  return (
    <span className="glyph num" title={label} aria-label={label}>
      {label}
    </span>
  );
}

/** Minimum group size: "👤 ≥10" (was "n ≥ 10"). */
export async function MinPeople() {
  const { t } = await getTL(panelDict);
  return (
    <span className="glyph num" title={t("g_need_min", { min: MIN_GROUP_SIZE })} aria-label={t("g_min_aria", { min: MIN_GROUP_SIZE })}>
      <span aria-hidden>👤</span> ≥{MIN_GROUP_SIZE}
    </span>
  );
}

/** Before and after sample sizes: "👤 24 → 31". */
export async function PeopleRange({ from, to }: { from: number; to: number }) {
  const { t, lang } = await getTL(panelDict);
  const fmt = (v: number) => numD(v, lang, 0);
  const label = t("g_range", { a: fmt(from), b: fmt(to) });
  return (
    <span className="glyph num" title={label} aria-label={label}>
      <span aria-hidden>👤</span> {fmt(from)} → {fmt(to)}
    </span>
  );
}
