"use client";

import { useT } from "@/lib/i18n/client";
import { hrDict } from "@/lib/i18n/hr";

export function PrintButton() {
  const t = useT(hrDict);
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      {t("print")}
    </button>
  );
}
