// Tiny typed i18n: one dictionary per surface (employee, hr, manager), Catalan is the source.
// `es` and `en` must have exactly the keys of `ca` (checked by tsc), so a missing string fails the build.
import type { Lang } from "@damm/shared";

export type Dict<K extends string = string> = Record<K, string>;
export interface Dictionary<K extends string = string> { ca: Dict<K>; es: Dict<K>; en: Dict<K> }

/** Declares a dictionary; `ca` fixes the key set and es/en must match it. */
export function defineDict<const C extends Record<string, string>>(d: {
  ca: C;
  es: Record<keyof C, string>;
  en: Record<keyof C, string>;
}): Dictionary<Extract<keyof C, string>> {
  return d as unknown as Dictionary<Extract<keyof C, string>>;
}

export type Params = Record<string, string | number>;
export type TFn<K extends string = string> = (key: K, params?: Params) => string;

/** Interpolates `{name}` placeholders. Falls back to Catalan, then to the key. */
export function makeT<K extends string>(dict: Dictionary<K>, lang: Lang): TFn<K> {
  return (key, params) => {
    const raw = dict[lang]?.[key] ?? dict.ca[key] ?? key;
    return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
  };
}

/** BCP-47 locale for Intl / toLocaleDateString. */
export const LOCALES: Record<Lang, string> = { ca: "ca-ES", es: "es-ES", en: "en-GB" };
