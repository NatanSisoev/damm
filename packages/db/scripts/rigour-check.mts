// Proves that no hidden n or mean can be recovered by subtraction.
// Run: pnpm --filter @damm/db run rigour-check   (builds its own scratch DB; never touches data/app.db)
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const scratch = path.join(os.tmpdir(), `rigour-check-${process.pid}.db`);
process.env.DB_PATH = scratch;
execFileSync("pnpm", ["exec", "tsx", "src/init.ts"], { cwd: path.resolve(import.meta.dirname, ".."), env: process.env, stdio: "ignore" });

const hr = await import("../src/hr.ts");
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

// 1. Logística, October: total 100, shifts 50 + 44 + 6 (suppressed).
const raw = { total: 100, mati: 50, tarda: 44 };
console.log(`Abans:   100 - ${raw.mati} - ${raw.tarda} = ${raw.total - raw.mati - raw.tarda}  (n del torn de nit recuperat)`);

const aggs = hr.listAggregates().filter((r) => r.periode === "2026-10" && r.collectiu === "Logística" && r.domini === null);
const shifts = aggs.filter((r) => r.torn !== null);
const total = aggs.find((r) => r.torn === null)!;
console.log("Després:", shifts.map((r) => `${r.torn}=${r.n ?? "ocult"}`).join(", "), `| total=${total.n}`);
const hidden = shifts.filter((r) => r.suprimit);
check(hidden.length >= 2, "Logística oct: almenys 2 torns ocults (mai 1 de sol)");
check(hidden.every((r) => r.n === null && r.mitjana === null), "els torns ocults no porten ni n ni mitjana");
const visibleSum = shifts.filter((r) => !r.suprimit).reduce((s, r) => s + (r.n ?? 0), 0);
console.log(`         total - visibles = ${total.n! - visibleSum}  (suma de ${hidden.length} torns ocults, no n'identifica cap)`);

// 2. Generic: for every group of siblings, hidden count is never exactly 1 (when a visible sibling existed).
const all = hr.listAggregates();
const groups = new Map<string, typeof all>();
for (const r of all) {
  if (r.collectiu === null) continue;
  const key = r.torn ? `t|${r.periode}|${r.collectiu}|${r.domini}` : `c|${r.periode}|${r.domini}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
let lone = 0;
for (const [k, g] of groups) {
  const h = g.filter((r) => r.suprimit).length;
  if (h === 1 && g.length > 1) { lone++; console.log("  grup amb un sol ocult:", k); }
}
check(lone === 0, "cap grup de germans amb exactament un segment ocult");
check(all.every((r) => !r.suprimit || (r.n === null && r.mitjana === null)), "tot segment ocult perd n i mitjana");

// 3. Trends: collectives under "Tots".
const trends = hr.getTrends();
let loneTrend = 0;
for (const [pi] of trends.periodes.entries()) {
  const nDom = trends.series[0].rows.length;
  for (let di = 0; di < nDom; di++) {
    const cells = trends.series.slice(1).map((s) => s.rows[di].cells[pi]).filter((c) => c.suprimit || c.mitjana !== null);
    if (cells.length > 1 && cells.filter((c) => c.suprimit).length === 1) loneTrend++;
  }
}
check(loneTrend === 0, "tendències: mai un sol col·lectiu ocult per període i domini");
check(trends.series.every((s) => s.rows.every((r) => r.cells.every((c) => !c.suprimit || (c.n === null && c.mitjana === null)))), "tendències: ocults sense n ni mitjana");

// 4. Representativeness: hidden shifts are never exactly one.
const rep = hr.getRepresentativeness();
const byCol = new Map<string, typeof rep.torns>();
for (const r of rep.torns) byCol.set(r.collectiu, [...(byCol.get(r.collectiu) ?? []), r]);
for (const [c, rows] of byCol) {
  const h = rows.filter((r) => r.suprimit).length;
  check(!(h === 1 && rows.length > 1), `representativitat ${c}: ${h} torns ocults`);
}
check([...rep.collectius, ...rep.torns].every((r) => !r.suprimit || (r.respondents === null && r.respShare === null && r.gap === null)), "representativitat: ocults sense dades");

// 5. Rules.
check(hr.precisionBand(29) === "indicativa" && hr.precisionBand(30) === "moderada" && hr.precisionBand(99) === "moderada" && hr.precisionBand(100) === "sòlida", "bandes de precisió");
check(hr.classifyChange({ mitjana: 3, n: 50 }, { mitjana: 3.3, n: 50 }).label === "puja", "canvi +0.3 amb n>=30: puja");
check(hr.classifyChange({ mitjana: 3, n: 50 }, { mitjana: 2.6, n: 50 }).label === "baixa", "canvi -0.4: baixa");
check(hr.classifyChange({ mitjana: 3, n: 50 }, { mitjana: 3.29, n: 50 }).label === "sense canvi clar", "canvi 0.29: sense canvi clar");
check(hr.classifyChange({ mitjana: 3, n: 29 }, { mitjana: 4, n: 50 }).label === "sense canvi clar", "n<30: sense canvi clar");
const cs = hr.complementarySuppression([{ n: 50, primary: false }, { n: 44, primary: false }, { n: 6, primary: false }]);
check(cs[0] === null && cs[1] === "complementari" && cs[2] === "primari", "50/44/6 amaga 44 i 6");
const cs2 = hr.complementarySuppression([{ n: 5, primary: false }, { n: 4, primary: false }, { n: 60, primary: false }, { n: 70, primary: false }]);
check(cs2[2] === "complementari", "dos petits que sumen <10 amaguen també el menor visible");

console.log(failures ? `\n${failures} comprovacions han fallat` : "\nTot correcte");
process.exit(failures ? 1 : 0);
