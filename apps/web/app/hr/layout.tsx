import { cookies } from "next/headers";
import { HrShell } from "./theme";
import { VIEW_ROLE_COOKIE, parseRole } from "@/lib/view-role";
import { hrAlarmCounts } from "@/lib/hr-engine";
import { countPendingRecommendations } from "@damm/db/hr";

export const dynamic = "force-dynamic";

export default async function HrLayout({ children }: LayoutProps<"/hr">) {
  const c = hrAlarmCounts();
  const recs = countPendingRecommendations();
  const role = parseRole((await cookies()).get(VIEW_ROLE_COOKIE)?.value);
  return (
    <HrShell
      role={role}
      badges={{
        alarms: { critical: c.critical, total: c.critical + c.warning + c.info },
        recommendations: recs,
      }}
    >
      {children}
    </HrShell>
  );
}
