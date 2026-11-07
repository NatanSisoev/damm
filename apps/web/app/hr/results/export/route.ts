import { exportResultsCsv } from "@damm/db/hr";

export const dynamic = "force-dynamic";

export function GET() {
  const now = new Date();
  return new Response("﻿" + exportResultsCsv(now), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resultats-agregats-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
