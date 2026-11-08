import type { Lang } from "@damm/shared";
import type { DecisionRow } from "@damm/db/hr";
import { LOCALES, makeT } from "@/lib/i18n/core";
import { trailDict, type TrailKey } from "@/lib/i18n/hr-trail";
import { statusLabel } from "./signal-labels";

const fmt = (d: string, lang: Lang) =>
  new Date(d.replace(" ", "T") + "Z").toLocaleString(LOCALES[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** One sentence for what happened, from the closed set of entity and action pairs. */
export function decisionLabel(d: DecisionRow, lang: Lang): string {
  const t = makeT(trailDict, lang);
  const key = `a_${d.entity}_${d.action}` as TrailKey;
  if (!(key in trailDict.ca)) return t("a_other");
  return t(key, { state: statusLabel(d.toState ?? "", lang).toLowerCase() });
}

export const decisionSource = (d: DecisionRow, lang: Lang) => makeT(trailDict, lang)(`f_${d.font}` as TrailKey);

/**
 * The trail as a list: when, who (an HR label), what, source. For an edit it shows the AI wording and the final one.
 * Aggregate by design: no employee, no account and no answer is ever part of a decision.
 */
export function DecisionList({ rows, lang }: { rows: DecisionRow[]; lang: Lang }) {
  const t = makeT(trailDict, lang);
  return (
    <ol className="divide-y divide-line">
      {rows.map((d) => (
        <li key={d.id} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[9rem_7rem_1fr]">
          <time className="num text-xs text-subtle" dateTime={d.at.replace(" ", "T") + "Z"}>{fmt(d.at, lang)}</time>
          <span className="text-xs text-subtle">{d.actor}</span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm">
              <span className="font-semibold">{decisionLabel(d, lang)}</span>
              <span className="ml-2 badge">{decisionSource(d, lang)}</span>
            </p>
            {d.subject && !d.textOriginal && <p className="truncate text-sm text-muted" title={d.subject}>{d.subject}</p>}
            {d.textOriginal && d.textFinal && d.textOriginal !== d.textFinal && (
              <dl className="space-y-0.5 text-sm text-muted">
                <div><dt className="inline text-xs text-subtle">{t("tr_was")} </dt><dd className="inline line-through decoration-line-strong">{d.textOriginal}</dd></div>
                <div><dt className="inline text-xs text-subtle">{t("tr_now")} </dt><dd className="inline text-ink">{d.textFinal}</dd></div>
              </dl>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
