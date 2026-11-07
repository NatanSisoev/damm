import { HrShell } from "./theme";

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  return <HrShell>{children}</HrShell>;
}
