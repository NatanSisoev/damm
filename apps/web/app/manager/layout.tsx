import { HrShell } from "../hr/theme";

export const dynamic = "force-dynamic";

export default function ManagerLayout({ children }: LayoutProps<"/manager">) {
  return <HrShell subtitle="Vista de responsables" manager>{children}</HrShell>;
}
