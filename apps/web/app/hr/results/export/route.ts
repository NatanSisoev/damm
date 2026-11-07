import { exportResultsCsv } from "@damm/db/hr";
import { getLang } from "@/lib/lang";
import { makeT } from "@/lib/i18n/core";
import { hrResultsDict } from "@/lib/i18n/hr-results";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  // Only the file name follows the UI language; the CSV body comes from the db package (aggregates, Catalan).
  const base = makeT(hrResultsDict, await getLang())("export_filename");
  return new Response("﻿" + exportResultsCsv(now), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
