// Languages and question translations. Catalan is the canonical base.
export const LANGS = ["ca", "es", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "ca";
export const LANG_LABELS: Record<Lang, string> = { ca: "Català", es: "Español", en: "English" };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Per-language text of one string (question text, option label). Any language may be missing. */
export type Translations = Partial<Record<Lang, string>>;

/**
 * The text to show in `lang`: the translation, else Catalan, else the stored canonical text.
 * Old rows have no translations and fall back to the stored text.
 */
export function pickText(i18n: Translations | null | undefined, fallback: string, lang: Lang): string {
  const own = i18n?.[lang]?.trim();
  if (own) return own;
  const ca = i18n?.[DEFAULT_LANG]?.trim();
  return ca || fallback;
}

/** First supported language in an Accept-Language header, else Catalan. */
export function negotiateLang(header: string | null | undefined): Lang {
  for (const part of (header ?? "").split(",")) {
    const tag = (part.split(";")[0] ?? "").trim().toLowerCase().slice(0, 2);
    if (isLang(tag)) return tag;
  }
  return DEFAULT_LANG;
}

/** Parses a text_i18n / option i18n JSON value; unknown languages and non-strings are dropped. */
export function parseTranslations(raw: unknown): Translations | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const out: Translations = {};
  for (const l of LANGS) {
    const t = (v as Record<string, unknown>)[l];
    if (typeof t === "string" && t.trim()) out[l] = t.trim();
  }
  return Object.keys(out).length ? out : null;
}
