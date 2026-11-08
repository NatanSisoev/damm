import type { ApprovedAction } from "@damm/db/employee";
import { LOCALES } from "@/lib/i18n/core";
import { employeeDict } from "@/lib/i18n/employee";
import { getTL } from "@/lib/i18n/server";
import type { Lang } from "@damm/shared";

function periodLabel(periode: string, lang: Lang): string {
  const [y, m] = periode.split("-");
  const month = Number(m);
  if (!y || !(month >= 1 && month <= 12)) return periode;
  const name = new Date(Date.UTC(Number(y), month - 1, 1)).toLocaleDateString(
    LOCALES[lang],
    {
      month: "long",
      timeZone: "UTC",
    },
  );
  return `${name} ${y}`;
}

// "Has dit, hem fet": actions HR approved for this person's collective. Aggregate context only
// (period and how many people were behind the signal); never who answered or what they said.
export async function ActionsList({ actions }: { actions: ApprovedAction[] }) {
  if (actions.length === 0) return null;
  const { t, lang } = await getTL(employeeDict);
  return (
    <section aria-labelledby="has-dit" className="card mt-6">
      <div className="card-header">
        <h2 id="has-dit" className="section-title">
          {t("actions_title")}
        </h2>
      </div>
      <div className="card-body">
        <ul className="space-y-3">
          {actions.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-line bg-surface-muted p-4"
            >
              <p className="text-base leading-6">{a.text}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="badge">{periodLabel(a.periode, lang)}</span>
                <span className="num">{t("actions_based_on", { n: a.n })}</span>
                {a.seguimentEnMarxa && (
                  <span className="badge badge-good">
                    {t("actions_follow_up")}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
