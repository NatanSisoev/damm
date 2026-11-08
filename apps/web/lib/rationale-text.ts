// Display-time tidy-up of a stored recommendation rationale ("Per què"). Rows written before the template was fixed keep
// a lowercase start, "torn mati", decimal points and an unlabelled "canvi"; new rows already come out right.
import type { Lang } from "@damm/shared";

const CHANGE: Record<Lang, [RegExp, string]> = {
  ca: [/\bcanvi (?=[-+−]?\d)/, "canvi respecte al període anterior "],
  es: [/\bcambio (?=[-+−]?\d)/, "cambio respecto al periodo anterior "],
  en: [/\bchange (?=[-+−]?\d)/, "change vs the previous period "],
};

export function tidyRationale(text: string, lang: Lang): string {
  let s = text.trim();
  if (lang !== "en") s = s.replace(/(\d)\.(\d)/g, "$1,$2");
  if (lang === "ca") s = s.replace(/\btorn mati\b/g, "torn matí");
  const [re, to] = CHANGE[lang];
  s = s.replace(re, to);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
