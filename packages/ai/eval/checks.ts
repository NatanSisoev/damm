// Deterministic checks for a drafted survey. Each returns a list of failures (empty = pass) and warnings.
import { DOMINIS } from "@damm/shared";
import { draftSurveySchema, estimateSeconds } from "../src/types";
import type { DraftSurvey, NeedInput } from "../src/index";

export interface EvalCase {
  id: string;
  tags: string[];
  need: NeedInput;
  expect?: { forbid?: string[]; topics?: string[]; bait?: boolean; absurd?: boolean; justify?: Record<string, string> };
}

export interface CheckResult {
  failures: { check: string; detail: string }[];
  warnings: { check: string; detail: string }[];
}

import { norm, words, jaccard, NOT_CATALAN, IDENTIFYING, LEADING, WH, YN_STARTS, leadingIn, identifyingIn, catalanErrorsIn, genderedIn, genderMixIn, anchorsClash } from "../src/quality";
export { leadingIn, identifyingIn };
void IDENTIFYING; void LEADING;

const SHORT = ["Fàbriques", "Logística"];
const CATALAN_TELLS = /(?:[çà-ü]|l'|d'|s'|t'|\bels\b|\bles\b|\bamb\b|\bper\b|\bdel\b|\bque\b|\bè?s\b|\bfeina\b|\bequip\b|\btens\b|\bquè\b|\bcom\b|\bpot\b|\bpoc\b|\bprou\b|\bet\b)/i;

export function runChecks(c: EvalCase, s: DraftSurvey): CheckResult {
  const failures: CheckResult["failures"] = [];
  const warnings: CheckResult["warnings"] = [];
  const fail = (check: string, detail: string) => failures.push({ check, detail });
  const warn = (check: string, detail: string) => warnings.push({ check, detail });
  const { need } = c;
  const short = !!need.collective && SHORT.includes(need.collective);

  // 1. schema (also covers types, domains, 3..6 questions)
  const parsed = draftSurveySchema.safeParse({ title: s.title, intro: s.intro, questions: s.questions });
  if (!parsed.success) fail("schema", parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  for (const q of s.questions) if (!(DOMINIS as readonly string[]).includes(q.domain)) fail("domain", q.domain);

  // 2. source: fallback is a failure in normal conditions
  if (s.source !== "llm") fail("fallback", s.notes.join(" "));

  // 3. count and format mix
  const n = s.questions.length;
  const opens = s.questions.filter((q) => q.type === "open").length;
  const maxOpen = short ? 1 : 2;
  if (need.questionCount ? n !== need.questionCount : n < 3 || n > 6) fail("count", `${n} questions${need.questionCount ? ` (asked for ${need.questionCount})` : ""}`);
  if (opens > maxOpen) fail("open-count", `${opens} open questions (max ${maxOpen})`);
  if (n >= 4 && new Set(s.questions.map((q) => q.type)).size === 1 && s.questions[0].type !== "scale5") warn("type-mix", `all ${s.questions[0].type}`);

  // 4. time budget
  const secs = estimateSeconds(s.questions.map((q) => q.type));
  if (need.maxSeconds && secs > need.maxSeconds) fail("time", `${secs}s > ${need.maxSeconds}s`);

  // 5. Catalan
  const all = [s.title, s.intro, ...s.questions.flatMap((q) => [q.text, q.reason, ...(q.low ? [q.low] : []), ...(q.high ? [q.high] : [])])];
  for (const t of all) {
    const bad = NOT_CATALAN.find((r) => r.test(t));
    if (bad) fail("catalan", `"${t.slice(0, 70)}" matches ${bad.source.slice(0, 30)}`);
    else if (words(t).length >= 4 && !CATALAN_TELLS.test(t)) warn("catalan", `no Catalan markers: "${t.slice(0, 60)}"`);
    const errs = catalanErrorsIn(t);
    if (errs.length) fail("catalan-errors", `"${t.slice(0, 70)}": ${errs[0]}`);
  }

  // 5b. gender: no gendered self-description, never a mix of masculine and feminine
  const qTexts = s.questions.map((q) => q.text);
  if (genderMixIn(qTexts)) fail("gender-mix", `masculine and feminine forms in one survey: ${qTexts.filter((t) => genderedIn(t).length).map((t) => `"${t.slice(0, 50)}"`).join(", ")}`);
  else for (const t of qTexts) if (genderedIn(t).length) warn("gender", `gendered wording: "${t.slice(0, 60)}"`);

  // 6. exclusions
  const forbid = (c.expect?.forbid ?? []).map((f) => new RegExp(f, "i"));
  for (const q of s.questions) {
    const hit = forbid.find((r) => r.test(q.text) || r.test(q.reason));
    if (hit) fail("exclusion", `"${q.text}"`);
  }
  for (const t of [s.title, s.intro]) {
    const hit = forbid.find((r) => r.test(t));
    if (hit) fail("exclusion", `title/intro: "${t.slice(0, 60)}"`);
  }

  // 7. duplicates
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const sim = jaccard(s.questions[i].text, s.questions[j].text);
      if (norm(s.questions[i].text) === norm(s.questions[j].text) || sim >= 0.6) fail("duplicate", `Q${i + 1}~Q${j + 1} (${sim.toFixed(2)})`);
      else if (sim >= 0.4) warn("near-duplicate", `Q${i + 1}~Q${j + 1} (${sim.toFixed(2)})`);
    }

  // 8. identifying / demographic questions (questions only; title/intro too)
  for (const q of s.questions) if (identifyingIn(q.text)) fail("identifying", `"${q.text}"`);
  if (identifyingIn(s.intro) || identifyingIn(s.title)) fail("identifying", "title/intro asks for personal data");

  // 9. leading wording
  for (const q of s.questions) if (leadingIn(q.text)) fail("leading", `"${q.text}"`);

  // 10. type sensibility
  for (const q of s.questions) {
    const t = q.text.trim();
    if ((q.type === "scale5" || q.type === "scale10") && /^(per què|què|quin|quina|quins|quines|on|qui|quan)\b/i.test(t)) fail("type", `${q.type} asks a wh-question: "${t}"`);
    if (q.type === "yes_no" && WH.test(t) && !YN_STARTS.test(t)) fail("type", `yes_no is not a yes/no question: "${t}"`);
    if (q.type === "open" && /^(estàs d'acord|tens prou|ets feliç)\b/i.test(t)) warn("type", `open looks closed: "${t}"`);
    if (q.type === "scale10" && !/recomanar|recomanaries|probab|0 a 10|del 0 al 10/i.test(t) && n > 3) warn("type", `scale10 without need: "${t}"`);
  }

  // 11. anchors
  for (const q of s.questions) {
    if (q.type === "scale5" || q.type === "scale10") {
      if (!q.low || !q.high) fail("anchors", `missing low/high: "${q.text}"`);
      else if (words(q.low).length > 4 || words(q.high).length > 4 || q.low === q.high) fail("anchors", `bad anchors "${q.low}" / "${q.high}"`);
      else if (anchorsClash(q.text, q.low, q.high)) fail("anchor-wording", `labels "${q.low}".."${q.high}" do not fit "${q.text.slice(0, 60)}"`);
    } else if (q.low || q.high) warn("anchors", `anchors on ${q.type}`);
  }

  // 12. wording length and single idea
  for (const q of s.questions) {
    const w = words(q.text).length;
    const limit = short ? 14 : 20;
    if (w > limit + 4) fail("length", `${w} words: "${q.text}"`);
    else if (w > limit) warn("length", `${w} words: "${q.text}"`);
    if (/\b(i|o|y)\b/i.test(q.text.replace(/\bi\/o\b/, "")) && / (i|o) /.test(q.text) && q.type !== "open" && /\b(tens|rebs|et sents|trobes|valores|saps|pots)\b.*\b(i|o)\b.*\b(tens|rebs|et sents|trobes|valores|saps|pots|és|són)\b/i.test(q.text)) warn("single-idea", `two verbs joined: "${q.text}"`);
    if (q.type !== "open" && !/[?]$/.test(q.text.trim()) && !/\.\.\.|:$/.test(q.text)) warn("format", `no question mark: "${q.text}"`);
  }

  const claimed = s.intro.match(/\b(\d+)\s+(preguntes?|qüestions?)\b/i);
  if (claimed && Number(claimed[1]) !== s.questions.length) fail("intro-count", `intro says ${claimed[1]} but there are ${s.questions.length}`);
  // 13. intro and title
  if (!/an[òo]nim|confiden|agregat|grups/i.test(s.intro)) warn("intro", "intro does not mention anonymity");
  if (words(s.title).length > 10) warn("title", "title longer than 10 words");
  if (words(s.intro).length > (short ? 30 : 45)) warn("intro", "intro too long");

  // 14. topic coverage (each regex must match at least one question)
  for (const t of c.expect?.topics ?? []) {
    const re = new RegExp(t, "i");
    if (!s.questions.some((q) => re.test(q.text))) fail("coverage", `no question matches /${t}/`);
  }

  // Justified exceptions are reported by the runner, not here.
  return { failures, warnings };
}
