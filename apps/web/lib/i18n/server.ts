// Server-side helper: `const t = await getT(employeeDict)` in pages, layouts, actions.
import { getLang } from "@/lib/lang";
import { makeT, type Dictionary, type TFn } from "./core";
import type { Lang } from "@damm/shared";

export async function getT<K extends string>(dict: Dictionary<K>): Promise<TFn<K>> {
  return makeT(dict, await getLang());
}
export async function getTL<K extends string>(dict: Dictionary<K>): Promise<{ t: TFn<K>; lang: Lang }> {
  const lang = await getLang();
  return { t: makeT(dict, lang), lang };
}
