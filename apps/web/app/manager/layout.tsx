import { HrShell } from "../hr/theme";
import { getT } from "@/lib/i18n/server";
import { managerDict } from "@/lib/i18n/manager";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({ children }: LayoutProps<"/manager">) {
  const t = await getT(managerDict);
  return (
    <HrShell subtitle={t("subtitle")} manager>
      {children}
    </HrShell>
  );
}
