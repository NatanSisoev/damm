// Accuracy of the deterministic comment classifier against the hidden seed label (resposta_seed.tema_real).
// Usage: pnpm --filter @damm/engine run comments:eval   (DB_PATH, default data/app.db; needs `pnpm --filter @damm/seed run seed`)
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { classifyComment, THEMES } from "../src/comments.ts";

const path = process.env.DB_PATH ?? resolve(import.meta.dirname, "../../../data/app.db");
const db = new DatabaseSync(path);
const rows = db.prepare("SELECT r.comentari AS text, s.tema_real AS real FROM resposta r JOIN resposta_seed s ON s.resposta_id = r.id WHERE r.comentari IS NOT NULL").all() as { text: string; real: string }[];
if (rows.length === 0) {
  console.error("No labelled comments (resposta_seed) in this database.");
  process.exit(1);
}

const stat = new Map<string, { tp: number; fp: number; fn: number; support: number }>();
const get = (k: string) => stat.get(k) ?? stat.set(k, { tp: 0, fp: 0, fn: 0, support: 0 }).get(k)!;
let top1 = 0, covered = 0, hit = 0, assigned = 0;
const misses: string[] = [];
for (const r of rows) {
  const ms = classifyComment(r.text);
  if (ms.length) covered++;
  if (ms[0]?.key === r.real) top1++;
  else if (misses.length < 400) misses.push(`${r.real} <- ${ms.map((m) => m.key).join(",") || "-"} | ${r.text}`);
  get(r.real).support++;
  for (const m of ms) {
    assigned++;
    if (m.key === r.real) { hit++; get(m.key).tp++; } else get(m.key).fp++;
  }
  if (!ms.some((m) => m.key === r.real)) get(r.real).fn++;
}
const f = (x: number) => (Math.round(x * 1000) / 10).toFixed(1).padStart(5);
console.log(`labelled comments: ${rows.length}`);
console.log("theme".padEnd(28), "support  precision  recall");
for (const th of THEMES) {
  const s = stat.get(th.key);
  if (!s || (s.support === 0 && s.fp === 0)) continue;
  console.log(th.key.padEnd(28), String(s.support).padStart(7), f(s.tp / Math.max(1, s.tp + s.fp)).padStart(10), f(s.tp / Math.max(1, s.tp + s.fn)).padStart(8));
}
const recall = rows.filter((r) => classifyComment(r.text).some((m) => m.key === r.real)).length / rows.length;
console.log(`\ntop-1 accuracy:        ${f(top1 / rows.length)}%`);
console.log(`micro precision (all assigned themes): ${f(hit / Math.max(1, assigned))}%`);
console.log(`micro recall (true theme among assigned): ${f(recall)}%`);
console.log(`coverage (at least one theme): ${f(covered / rows.length)}%`);
if (process.argv.includes("--misses")) console.log("\n" + misses.join("\n"));
