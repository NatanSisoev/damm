import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsKey } from "@/lib/i18n/hr-results";

export type LimitsView = "results" | "trend" | "signal" | "themes" | "manager";

const KEY: Record<LimitsView, HrResultsKey> = {
  results: "lim_results",
  trend: "lim_trend",
  signal: "lim_signal",
  themes: "lim_themes",
  manager: "lim_manager",
};

/** One-line footnote under an analysis view: the limit that applies there (docs/engine.md section 12) and a link to the method. */
export async function LimitsNote({ view, className = "" }: { view: LimitsView; className?: string }) {
  const { t } = await getTL(hrResultsDict);
  return (
    <p className={`text-xs text-subtle ${className}`}>
      {t(KEY[view], { min: MIN_GROUP_SIZE })}{" "}
      <Link href="/hr/methodology" className="underline">{t("lim_how")}</Link>
    </p>
  );
}
