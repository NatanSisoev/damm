// Eval runner: drafts every case, runs deterministic checks and the LLM judge, writes a markdown report.
// Usage: pnpm --filter @damm/ai run eval [-- --label x] [--only id,id] [--no-judge] [--redraft] [--final] [--concurrency 2]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { draftSurvey, redraftQuestion, estimateSeconds } from "../src/index";
import type { DraftSurvey } from "../src/index";
import { runChecks, type CheckResult, type EvalCase } from "./checks";
import { DIMENSIONS, judge, type Judgement } from "./judge";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

// Load .env from the repo root without printing it.
for (const p of [join(here, "../../../.env")]) {
  try {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env */ }
}

const label = opt("label") ?? "run";
const final = flag("final");
const concurrency = Math.min(2, Number(opt("concurrency") ?? 2));
const useJudge = !flag("no-judge");
const doRedraft = flag("redraft");
const only = opt("only")?.split(",");
const allCases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8")) as EvalCase[];
const cases = only ? allCases.filter((c) => only.some((o) => c.id.startsWith(o))) : allCases;

// Deliberately bad surveys: the judge must score these low, otherwise it is too lenient to trust.
const CONTROLS: { id: string; need: EvalCase["need"]; survey: Pick<DraftSurvey, "title" | "intro" | "questions"> }[] = [
  { id: "control-leading", need: { objective: "Valorar la nova cantina", collective: "Fàbriques", maxSeconds: 40 }, survey: { title: "La cantina", intro: "Respon.", questions: [
    { text: "No creus que la nova cantina és fantàstica?", type: "yes_no", domain: "Condicions i organització", reason: "x" },
    { text: "Com d'increïble trobes el menjar nou?", type: "scale5", domain: "Condicions i organització", reason: "x", low: "Bo", high: "Excel·lent" },
    { text: "Estàs encantat amb el servei i amb els preus?", type: "scale5", domain: "Condicions i organització", reason: "x", low: "Poc", high: "Molt" }] } },
  { id: "control-identifying", need: { objective: "Benestar del torn de nit", collective: "Logística", maxSeconds: 60 }, survey: { title: "Torn de nit", intro: "Contesta amb sinceritat.", questions: [
    { text: "Quina edat tens i quants anys fa que treballes aquí?", type: "open", domain: "Benestar", reason: "x" },
    { text: "Quin és el teu cap directe i de quin equip ets exactament?", type: "open", domain: "Lideratge", reason: "x" },
    { text: "Quina és la teva ciutat i el teu gènere?", type: "open", domain: "Cultura i pertinença", reason: "x" }] } },
  { id: "control-spanish", need: { objective: "Comunicació interna", collective: "Oficines", maxSeconds: 60 }, survey: { title: "Comunicación", intro: "Gracias por participar en esta encuesta.", questions: [
    { text: "¿Cómo valoras la comunicación de tu equipo?", type: "scale5", domain: "Entorn i relacions", reason: "x", low: "Mal", high: "Bien" },
    { text: "¿Recibes la información que necesitas a tiempo?", type: "yes_no", domain: "Entorn i relacions", reason: "x" },
    { text: "¿Qué mejorarías de la comunicación interna?", type: "open", domain: "Entorn i relacions", reason: "x" }] } },
  { id: "control-irrelevant-barrelled", need: { objective: "Seguretat al magatzem: equips de protecció i calor", collective: "Logística", maxSeconds: 60 }, survey: { title: "Opinió", intro: "Gràcies.", questions: [
    { text: "Quina és la teva opinió general sobre la direcció estratègica, la cultura corporativa i la satisfacció global amb l'empresa?", type: "scale5", domain: "Cultura i pertinença", reason: "x", low: "Mala", high: "Bona" },
    { text: "Tens prou formació i et sents valorat pel teu cap i pels companys?", type: "yes_no", domain: "Desenvolupament", reason: "x" },
    { text: "T'agrada el color de les parets del vestidor?", type: "scale10", domain: "Condicions i organització", reason: "x" }] } },
];

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

interface Row {
  c: EvalCase;
  survey: DraftSurvey;
  ms: number;
  checks: CheckResult;
  judged?: Judgement;
  judgeAvg?: number;
  redraft?: { original: string; replacement: string; source: string; different: boolean; checkFailures: string[]; judgeAvgBefore?: number; judgeAvgAfter?: number; ms: number } | null;
}

async function evalCase(c: EvalCase): Promise<Row> {
  const t0 = Date.now();
  const survey = await draftSurvey(c.need);
  const ms = Date.now() - t0;
  const checks = runChecks(c, survey);
  const row: Row = { c, survey, ms, checks };
  if (useJudge) {
    try {
      row.judged = await judge(c.need, survey);
      row.judgeAvg = row.judged.overall;
    } catch { /* judge unavailable: leave blank */ }
  }
  if (doRedraft && survey.source === "llm") {
    const k = survey.questions.findIndex((q) => q.type === "scale5" || q.type === "yes_no");
    const idx = k >= 0 ? k : 0;
    const cur = survey.questions[idx];
    const others = survey.questions.filter((_, i) => i !== idx);
    const r0 = Date.now();
    const r = await redraftQuestion(c.need, cur, others);
    const rms = Date.now() - r0;
    if (!r) row.redraft = null;
    else {
      const replaced = { ...survey, questions: survey.questions.map((q, i) => (i === idx ? r.question : q)) };
      const rc = runChecks(c, replaced);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-zàèéíòóúçïü0-9 ]/g, "");
      const tok = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
      const sim = (a: string, b: string) => { const A = tok(a), B = tok(b); let i = 0; for (const w of A) if (B.has(w)) i++; return A.size + B.size ? i / (A.size + B.size - i) : 0; };
      const different = sim(cur.text, r.question.text) < 0.6 && !others.some((o) => sim(o.text, r.question.text) >= 0.6);
      let after: number | undefined;
      if (useJudge) { try { after = (await judge(c.need, replaced)).overall; } catch { /* skip */ } }
      row.redraft = { original: cur.text, replacement: `${r.question.text} [${r.question.type}${r.question.low ? `, ${r.question.low}..${r.question.high}` : ""}]`, source: r.source, different, checkFailures: rc.failures.map((f) => `${f.check}: ${f.detail}`), judgeAvgBefore: row.judgeAvg, judgeAvgAfter: after, ms: rms };
    }
  }
  process.stderr.write(`${c.id.padEnd(34)} ${row.survey.source} ${String(ms).padStart(6)}ms fails=${checks.failures.length} warn=${checks.warnings.length}${row.judgeAvg ? ` judge=${row.judgeAvg.toFixed(2)}` : ""}\n`);
  return row;
}

async function main() {
  if (flag("controls")) {
    for (const k of CONTROLS) { const j = await judge(k.need, k.survey); console.log(k.id, j.overall.toFixed(2), JSON.stringify(j.scores), "\n  ", j.issues.join("\n   ")); }
    return;
  }
  const rows = await pool(cases, concurrency, evalCase);

  // judge calibration
  const controls: { id: string; avg: number; scores: Record<string, number> }[] = [];
  if (useJudge && !only) {
    for (const k of CONTROLS) {
      try { const j = await judge(k.need, k.survey); controls.push({ id: k.id, avg: j.overall, scores: j.scores }); } catch { /* skip */ }
    }
  }

  const lat = rows.map((r) => r.ms);
  const llmRows = rows.filter((r) => r.survey.source === "llm");
  const judged = rows.filter((r) => r.judged);
  const dimAvg = Object.fromEntries(DIMENSIONS.map((d) => [d, avg(judged.map((r) => r.judged!.scores[d]))])) as Record<string, number>;
  const dimMin = Object.fromEntries(DIMENSIONS.map((d) => [d, Math.min(...judged.map((r) => r.judged!.scores[d]))])) as Record<string, number>;
  const failCounts: Record<string, number> = {};
  const warnCounts: Record<string, number> = {};
  for (const r of rows) {
    for (const f of new Set(r.checks.failures.map((x) => x.check))) failCounts[f] = (failCounts[f] ?? 0) + 1;
    for (const w of new Set(r.checks.warnings.map((x) => x.check))) warnCounts[w] = (warnCounts[w] ?? 0) + 1;
  }
  const casesClean = rows.filter((r) => r.checks.failures.length === 0).length;
  const summary = {
    label, cases: rows.length, casesAllChecksPass: casesClean,
    fallbackRate: rows.filter((r) => r.survey.source !== "llm").length / rows.length,
    latencyP50: pct(lat, 0.5), latencyP90: pct(lat, 0.9), latencyMax: Math.max(...lat),
    judgeAvg: avg(judged.map((r) => r.judgeAvg!)), dimAvg, dimMin, failCounts, warnCounts,
    avgQuestions: avg(rows.map((r) => r.survey.questions.length)),
    avgSeconds: avg(rows.map((r) => estimateSeconds(r.survey.questions.map((q) => q.type)))),
    controls,
  };

  const f = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
  const md: string[] = [];
  md.push(`# AI drafting eval: ${label}`, "", `Generated ${new Date().toISOString().slice(0, 16)}Z. Model \`${process.env.LLM_MODEL || "ornith"}\`, ${rows.length} cases.`, "");
  md.push("## Aggregates", "", "| Metric | Value |", "|---|---|");
  md.push(`| Cases with every deterministic check passing | ${casesClean}/${rows.length} |`);
  md.push(`| Fallback rate | ${f(summary.fallbackRate * 100, 1)}% |`);
  md.push(`| Latency p50 / p90 / max | ${f(summary.latencyP50 / 1000, 1)} s / ${f(summary.latencyP90 / 1000, 1)} s / ${f(summary.latencyMax / 1000, 1)} s |`);
  md.push(`| Judge average (1-5) | ${f(summary.judgeAvg)} |`);
  md.push(`| Avg questions / avg estimated seconds | ${f(summary.avgQuestions, 1)} / ${f(summary.avgSeconds, 0)} |`);
  md.push("", "### Judge by dimension", "", "| Dimension | Avg | Min |", "|---|---|---|");
  for (const d of DIMENSIONS) md.push(`| ${d} | ${f(dimAvg[d])} | ${dimMin[d]} |`);
  md.push("", "### Deterministic failures by check (cases affected)", "");
  md.push(Object.keys(failCounts).length ? Object.entries(failCounts).map(([k, v]) => `- ${k}: ${v}`).join("\n") : "- none");
  md.push("", "### Warnings by check (cases affected)", "");
  md.push(Object.keys(warnCounts).length ? Object.entries(warnCounts).map(([k, v]) => `- ${k}: ${v}`).join("\n") : "- none");
  if (controls.length) {
    md.push("", "### Judge calibration (deliberately bad surveys; should score well under 3)", "", "| Control | Avg |", "|---|---|");
    for (const k of controls) md.push(`| ${k.id} | ${f(k.avg)} |`);
  }
  if (doRedraft) {
    const rd = rows.filter((r) => r.redraft);
    md.push("", "### Regenerate (redraftQuestion) summary", "", `- ${rd.length} redrafts, different from current and others: ${rd.filter((r) => r.redraft!.different).length}, via LLM: ${rd.filter((r) => r.redraft!.source === "llm").length}, passing all checks: ${rd.filter((r) => r.redraft!.checkFailures.length === 0).length}`);
    const b = rd.filter((r) => r.redraft!.judgeAvgBefore && r.redraft!.judgeAvgAfter);
    md.push(`- Judge average before / after the swap: ${f(avg(b.map((r) => r.redraft!.judgeAvgBefore!)))} / ${f(avg(b.map((r) => r.redraft!.judgeAvgAfter!)))}; latency p50 ${f(pct(rd.map((r) => r.redraft!.ms), 0.5) / 1000, 1)} s`);
  }
  md.push("", "## Cases", "");
  for (const r of rows) {
    md.push(`### ${r.c.id}  (${r.survey.source}, ${f(r.ms / 1000, 1)} s${r.judgeAvg ? `, judge ${f(r.judgeAvg)}` : ""})`, "");
    md.push(`Need (${r.c.need.collective ?? "tots"}, ${r.c.need.maxSeconds ?? "sense límit"} s): ${r.c.need.objective}${r.c.need.exclusions ? ` | NO: ${r.c.need.exclusions}` : ""}`, "");
    md.push(`**${r.survey.title}** — ${r.survey.intro}`, "");
    r.survey.questions.forEach((q, i) => md.push(`${i + 1}. ${q.text} \`${q.type}${q.low ? ` ${q.low}..${q.high}` : ""}\` _${q.domain}_`));
    md.push("", `Estimated ${estimateSeconds(r.survey.questions.map((q) => q.type))} s.`);
    if (r.checks.failures.length) md.push("", "Failures:", ...r.checks.failures.map((x) => `- **${x.check}**: ${x.detail}`));
    if (r.checks.warnings.length) md.push("", "Warnings:", ...r.checks.warnings.map((x) => `- ${x.check}: ${x.detail}`));
    if (r.judged) md.push("", `Judge: ${DIMENSIONS.map((d) => `${d} ${r.judged!.scores[d]}`).join(", ")}`, ...(r.judged.issues.length ? ["Judge issues:", ...r.judged.issues.map((x) => `- ${x}`)] : []));
    if (r.redraft) md.push("", `Regenerate: "${r.redraft.original}" → "${r.redraft.replacement}" (${r.redraft.source}, ${r.redraft.different ? "different" : "TOO SIMILAR"}${r.redraft.checkFailures.length ? `, failures: ${r.redraft.checkFailures.join("; ")}` : ""})`);
    md.push("");
  }

  mkdirSync(join(here, "results"), { recursive: true });
  const base = final ? "report" : `run-${label}`;
  writeFileSync(join(here, "results", `${base}.md`), md.join("\n"));
  writeFileSync(join(here, "results", `run-${label}.json`), JSON.stringify({ summary, rows: rows.map((r) => ({ id: r.c.id, survey: r.survey, ms: r.ms, checks: r.checks, judged: r.judged, redraft: r.redraft })) }, null, 1));
  process.stderr.write(`\nWrote results/${base}.md\n`);
  console.log(JSON.stringify(summary, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v), 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
