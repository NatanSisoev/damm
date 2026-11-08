// Theme preference: `damm_theme` cookie ("light" | "dark"). No cookie means light (only the toggle writes it).
// The root layout reads it to set data-theme on <html>; the toggle writes it client-side (components/theme-toggle.tsx).
import { cookies } from "next/headers";

export const THEME_COOKIE = "damm_theme";
export type Theme = "light" | "dark";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";

export async function getTheme(): Promise<Theme | undefined> {
  const c = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(c) ? c : undefined;
}
