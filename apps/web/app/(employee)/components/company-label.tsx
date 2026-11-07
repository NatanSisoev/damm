"use client";

import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

// Relation to Estrella Damm: text only, no logo.
export function CompanyLabel() {
  const t = useT(employeeDict);
  return <p className="eyebrow pb-8 text-center">{t("company_label")}</p>;
}
