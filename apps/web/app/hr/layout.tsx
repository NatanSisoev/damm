import { HrShell } from "./theme";
import { hrAlarmCounts } from "@/lib/hr-engine";
import { countPendingRecommendations } from "@damm/db/hr";

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  const c = hrAlarmCounts();
  return (
    <HrShell
      badges={{
        alarms: { critical: c.critical, total: c.critical + c.warning + c.info },
        recommendations: countPendingRecommendations(),
      }}
    >
      {children}
    </HrShell>
  );
}
