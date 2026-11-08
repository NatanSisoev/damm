"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_ROLE_COOKIE, parseRole } from "@/lib/view-role";

/** Testing toggle: switch the HR portal between the full HR view and the dashboard-only manager view. */
export async function setViewRoleAction(form: FormData) {
  const role = parseRole(String(form.get("role") ?? ""));
  (await cookies()).set(VIEW_ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  redirect("/hr");
}
