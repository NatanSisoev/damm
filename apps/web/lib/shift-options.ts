import type { ShiftOption } from "@damm/db/join";
import type { Lang } from "@damm/shared";
import { shiftLabel } from "@/lib/i18n/names";
import type { ShiftChoice } from "@/app/(employee)/components/shift-picker";

/** Shift options with labels in the UI language (first letter upper-case). */
export function shiftChoices(options: ShiftOption[], lang: Lang): ShiftChoice[] {
  return options.map((o) => {
    const l = shiftLabel(o.nom, lang);
    return { value: o.nom, label: l.charAt(0).toUpperCase() + l.slice(1) };
  });
}
