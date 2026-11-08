import { cookies } from "next/headers";
import { HrShell } from "./theme";
import { VIEW_ROLE_COOKIE, parseRole } from "@/lib/view-role";

export const dynamic = "force-dynamic";

export default async function HrLayout({ children }: LayoutProps<"/hr">) {
  const role = parseRole((await cookies()).get(VIEW_ROLE_COOKIE)?.value);
  return (
    <HrShell role={role}>{children}</HrShell>
  );
}
