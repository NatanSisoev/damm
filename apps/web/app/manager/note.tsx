import { MIN_GROUP_SIZE } from "@damm/shared";
import { getT } from "@/lib/i18n/server";
import { managerDict } from "@/lib/i18n/manager";

export async function AggregateNote() {
  const t = await getT(managerDict);
  return (
    <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-[13px] text-muted">
      {t("note_a", { min: MIN_GROUP_SIZE })}<span className="font-semibold">{t("suppressed")}</span>{t("note_b")}
    </p>
  );
}
