// Language-aware number helpers for HR and manager screens (format.ts stays Catalan-only for legacy callers).
import type { Lang } from "@damm/shared";
import { LOCALES } from "./core";

/** Fixed decimals in the UI language: 3.14 to "3,1" (ca/es) or "3.1" (en). */
export const numD = (v: number, lang: Lang, digits = 1) =>
  v.toLocaleString(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const num1L = (v: number, lang: Lang) => numD(v, lang, 1);
export const num2L = (v: number, lang: Lang) => numD(v, lang, 2);

/** Signed one-decimal difference with a real minus sign. */
export const signed1L = (v: number, lang: Lang) => `${v >= 0 ? "+" : "−"}${num1L(Math.abs(v), lang)}`;
