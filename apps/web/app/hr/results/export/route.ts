import { exportResultsCsv } from "@damm/db/hr";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response("﻿" + exportResultsCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="resultats-agregats.csv"',
      "Cache-Control": "no-store",
    },
  });
}
