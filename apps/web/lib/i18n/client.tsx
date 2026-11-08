"use client";
// Client-side: the root layout provides the language; components call `useT(dict)`.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LANG, type Lang } from "@damm/shared";
import { makeT, type Dictionary, type TFn } from "./core";

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}
export function useLang(): Lang {
  return useContext(LangContext);
}
export function useT<K extends string>(dict: Dictionary<K>): TFn<K> {
  const lang = useLang();
  return useMemo(() => makeT(dict, lang), [dict, lang]);
}
