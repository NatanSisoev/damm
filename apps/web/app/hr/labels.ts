// Labels for raw enum values the DB stores (estat, tipus). Never render the raw value.
// Pass `lang` to get a translated label; without it the Catalan label is returned.
import type { Lang } from "@damm/shared";
import { hrLookup } from "@/lib/i18n/hr";

export const RECOMMENDATION_STATUS: Record<string, { key: string; cls: string }> = {
  proposada: { key: "rec_proposed", cls: "" },
  aprovada: { key: "rec_approved", cls: "badge-good" },
  descartada: { key: "rec_discarded", cls: "" },
};

export const NEED_STATUS: Record<string, { key: string; cls: string }> = {
  esborrany: { key: "need_draft", cls: "" },
  llesta: { key: "need_ready", cls: "badge-accent" },
  publicada: { key: "need_published", cls: "badge-good" },
  tancada: { key: "need_closed", cls: "" },
};

const label = (key: string, fallback: string, lang: Lang) => (key ? hrLookup("", key, lang) : fallback);

export const recommendationStatus = (estat: string, lang: Lang = "ca") => {
  const s = RECOMMENDATION_STATUS[estat];
  return s ? { label: label(s.key, estat, lang), cls: s.cls } : { label: estat, cls: "" };
};
export const needStatus = (estat: string, lang: Lang = "ca") => {
  const s = NEED_STATUS[estat];
  return s ? { label: label(s.key, estat, lang), cls: s.cls } : { label: estat, cls: "" };
};
export const questionTypeLabel = (tipus: string, lang: Lang = "ca") => hrLookup("qt_", tipus, lang);

/** "1 minut", "2 minuts" (translated). */
export const minutes = (n: number, lang: Lang = "ca") =>
  hrLookup("", n === 1 ? "minute_one" : "minute_other", lang).replace("{n}", String(n));
