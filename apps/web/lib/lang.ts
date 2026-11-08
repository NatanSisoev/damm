// UI language for the current request: `damm_lang` cookie, else Catalan.
// The browser or OS language is deliberately ignored: Catalan is the default until the person picks another.
// Only the language choice is stored (cookie, and compte.lang for signed-in employees).
import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, type Lang } from "@damm/shared";

export const LANG_COOKIE = "damm_lang";
const MAX_AGE_S = 60 * 60 * 24 * 365;

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return DEFAULT_LANG;
}

export async function setLangCookie(lang: Lang): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}
