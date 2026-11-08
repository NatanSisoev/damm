// Security demo, step 3 (reader): prints what HR code can see about the thinned segment, through the
// HR repository only (the same functions the pages and the CSV export use).
// Called by scripts/suppression-demo.sh with DB_PATH pointing at the scratch copy:
//   cd packages/db && DB_PATH=/tmp/copy.db pnpm exec tsx ../../scripts/suppression-demo-read.mts 2026-10 3
import { exportResultsCsv, getRepresentativeness } from "../packages/db/src/hr-repository";

if (!process.env.DB_PATH) throw new Error("Set DB_PATH to a scratch copy of the database.");
const periode = process.argv[2] ?? "2026-10";

const rep = getRepresentativeness();
console.log(`getRepresentativeness() for the reading period ${rep.periode}:`);
for (const r of rep.collectius) {
  const what = r.suprimit ? `SUPRIMIT (${r.motiu})` : `n=${r.respondents}, resp ${(r.respShare! * 100).toFixed(1)}%, pop ${(r.popShare! * 100).toFixed(1)}%`;
  console.log(`  ${r.collectiu.padEnd(10)} ${what}`);
}

const out: unknown = exportResultsCsv();
const csv = typeof out === "string" ? out : String((out as { csv?: string }).csv ?? "");
const lines = csv.split("\n");
console.log(`\nCSV export, header and the rows of ${periode} with suprimit=1:`);
console.log(lines.find((l) => l.startsWith("tipus,")) ?? "(no header)");
const hidden = lines.filter((l) => {
  const f = l.split(",");
  return f[1] === periode && f[10] === "1";
});
console.log(hidden.slice(0, 12).join("\n") || "(no suppressed rows)");
