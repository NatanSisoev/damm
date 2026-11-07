import { MIN_GROUP_SIZE } from "@damm/shared";

export function AggregateNote() {
  return (
    <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-[13px] text-muted">
      Vista de només lectura amb dades agregades. No hi ha respostes ni comentaris individuals, i els grups de menys de {MIN_GROUP_SIZE} persones
      es mostren com a <span className="font-medium">Suprimit</span>. Només es mostren les recomanacions que l&apos;equip de persones ha aprovat.
    </p>
  );
}
