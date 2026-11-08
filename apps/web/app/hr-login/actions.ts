"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { HR_COOKIE, accessToken, gateEnabled, gateMisconfigured } from "../../lib/hr-access";

const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; since: number }>();

function limited(ip: string): boolean {
  const e = fails.get(ip);
  return !!e && Date.now() - e.since < WINDOW_MS && e.n >= MAX_FAILS;
}
function recordFail(ip: string): void {
  const e = fails.get(ip);
  if (!e || Date.now() - e.since >= WINDOW_MS) fails.set(ip, { n: 1, since: Date.now() });
  else e.n++;
}
function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function loginAction(formData: FormData) {
  const next = String(formData.get("next") ?? "/hr");
  const dest = (next.startsWith("/hr") || next.startsWith("/manager")) && !next.startsWith("//") ? next : "/hr";
  if (gateMisconfigured()) redirect("/hr-login?error=unconfigured");
  if (!gateEnabled()) redirect(dest);
  const ip = await clientIp();
  const code = String(formData.get("code") ?? "");
  if (limited(ip) || !sameCode(code, process.env.HR_ACCESS_CODE ?? "")) {
    recordFail(ip);
    redirect(`/hr-login?error=1&next=${encodeURIComponent(dest)}`);
  }
  fails.delete(ip);
  (await cookies()).set(HR_COOKIE, await accessToken(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect(dest);
}

export async function logoutAction() {
  (await cookies()).delete(HR_COOKIE);
  redirect("/hr-login");
}
