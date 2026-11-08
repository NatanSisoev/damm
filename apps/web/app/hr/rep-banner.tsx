import Link from "next/link";
import { underRepresented, type Representativeness } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { collectiveLabel, shiftLabel } from "@/lib/i18n/names";

/**
 * Explicit warning when a visible segment answers clearly less than the rest (A5, B3, R-FLOW-5e). Aggregates only:
 * suppressed segments never reach `underRepresented`. Renders nothing when no segment is flagged.
 */
export async function RepBanner({ rep, max = 3 }: { rep: Representativeness; max?: number }) {
  const flagged = underRepresented(rep).slice(0, max);
  if (flagged.length === 0) return null;
  const { t, lang } = await getTL(hrResultsDict);
  const pct = (x: number) => Math.round(x * 100);
  return (
    <section role="status" aria-label={t("rb_title")} className="mb-4 border border-line border-l-2 border-l-accent bg-surface px-4 py-3 text-[13px]">
      <p className="font-semibold">{t("rb_title")}</p>
      <ul className="mt-1 space-y-1">
        {flagged.map((f) => {
          const label = collectiveLabel(f.collectiu, lang);
          const text = f.torn
            ? f.refTorn
              ? t("rb_shift", { label, shift: shiftLabel(f.torn, lang), rate: pct(f.rate), refRate: pct(f.refRate), refShift: t("rb_vs_shift", { shift: shiftLabel(f.refTorn, lang) }) })
              : t("rb_shift_plain", { label, shift: shiftLabel(f.torn, lang), rate: pct(f.rate), refRate: pct(f.refRate) })
            : t("rb_col", { label, rate: pct(f.rate), refRate: pct(f.refRate) });
          return <li key={`${f.collectiu}-${f.torn}`}>{text}</li>;
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/hr/needs?nova=1#nova" className="underline">{t("rb_need")}</Link>
        <Link href="/hr/needs" className="underline">{t("rb_remind")}</Link>
        <Link href="/hr/methodology" className="underline">{t("rb_how")}</Link>
      </p>
    </section>
  );
}
