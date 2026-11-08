import Link from "next/link";
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
export async function ActionsLink({ actions }: { actions: ApprovedAction[] }) {
  if (actions.length === 0) return null;
  const { t } = await getTL(employeeDict);
  return (
    <Link
      href="/accions"
      className="card mt-6 flex items-center justify-between gap-3 p-4 no-underline"
    >
      <span>
        <span className="section-title block">{t("actions_title")}</span>
        <span className="mt-1 block text-sm text-muted">
          {t("actions_count", { n: actions.length })}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-subtle">
        ›
      </span>
    </Link>
  );
}

export async function ActionsList({ actions }: { actions: ApprovedAction[] }) {
  const { t, lang } = await getTL(employeeDict);
  if (actions.length === 0) {
    return <p className="mt-4 text-muted">{t("actions_empty")}</p>;
  }
  return (
    <section aria-labelledby="has-dit" className="card mt-4">
      <div className="card-body">
        <h2 id="has-dit" className="sr-only">
          {t("actions_title")}
        </h2>
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
