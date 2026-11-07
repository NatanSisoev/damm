import { HrShell } from "./theme";
import { hrAlarmCounts } from "@/lib/hr-engine";

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  const c = hrAlarmCounts();
  return <HrShell alarms={{ critical: c.critical, total: c.critical + c.warning + c.info }}>{children}</HrShell>;
}
