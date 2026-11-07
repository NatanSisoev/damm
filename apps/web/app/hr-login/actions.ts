"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HR_COOKIE, accessToken, gateEnabled } from "../../lib/hr-access";

export async function loginAction(formData: FormData) {
  const next = String(formData.get("next") ?? "/hr");
  const dest = (next.startsWith("/hr") || next.startsWith("/manager")) && !next.startsWith("//") ? next : "/hr";
  if (!gateEnabled()) redirect(dest);
  const code = String(formData.get("code") ?? "");
  if (code !== process.env.HR_ACCESS_CODE) redirect(`/hr-login?error=1&next=${encodeURIComponent(dest)}`);
  (await cookies()).set(HR_COOKIE, await accessToken(code), { httpOnly: true, sameSite: "lax", path: "/hr", maxAge: 60 * 60 * 12 });
  redirect(dest);
}
