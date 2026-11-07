// LLM-as-judge. A strict rubric, temperature 0, and the model must name the weakest question and its flaw before scoring.
import { chatJson } from "../src/llm";
import { norm } from "../src/quality";
import type { DraftSurvey, NeedInput } from "../src/index";

export const DIMENSIONS = ["relevance", "neutrality", "single_idea", "clarity", "answer_type", "coverage", "anonymity", "catalan"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface Judgement {
  scores: Record<Dimension, number>;
  weakest: string;
  issues: string[];
  /** Survey-level score: 5 minus half the defect penalty (2 per major, 1 per minor), floor 1. Not diluted by clean dimensions. */
  overall: number;
}

const RUBRIC = `You audit workplace micro-surveys for a brewery company (synthetic data). An AI drafted a survey from an HR need. You do NOT give scores. You list concrete DEFECTS, each with an exact quote from the survey, and a program computes the scores from them. A defect without an exact quote is discarded, so only report what you can quote.
Dimensions and what counts as a defect:
- relevance: a question that does not serve the HR need (filler, off-topic, plays along with an inappropriate part of the need). Major if the question is unrelated to the need.
- neutrality: leading or loaded wording ("no creus que...", "fantastic", "com d'excel·lent"), a question that suggests the right answer. Major if clearly leading.
- single_idea: a question asking two things at once (double-barrelled, "X i Y", "X o Y"). Major if two different topics.
- clarity: jargon, abstract nouns, ambiguity about time frame or object, too long for a phone. Minor unless it cannot be understood.
- answer_type: wrong response type for the question, or scale end labels (shown after the type) that do not fit the wording: agreement labels on a frequency question, "Mai/Sempre" on a "Fins a quin punt" question, "Del tot" on a "Fins a quin punt" question, open type for a yes/no question, scale type for a "Per què/Què/Quin" question. Major if the labels or type make the question unanswerable.
- coverage: part of the need or its context is not covered by any question (name it). Also redundant questions that repeat each other. Major if a main part of the need is missing.
- anonymity: asks for or could identify a person or small group (age, gender, exact shift or team, manager name, health data, "who"), or invites naming people. Always major.
- catalan: text not in Catalan (Spanish or English words), or Catalan errors (wrong contraction "al equip", incomplete words, Valencian forms, calques). Major if a sentence is not Catalan, minor for a single slip.
Also report as catalan a gender mix: masculine and feminine self-descriptions in the same survey (satisfet next to valorada) is minor, one gendered form alone is not a defect.
Rules: quote at most 12 words, copied exactly. At most 10 defects. Do not invent defects; if the survey is clean report none. Do not praise.
Reply ONLY with JSON: {"defects": [{"dimension": string, "severity": "major"|"minor", "question": integer (question number, 0 for title/intro/whole survey), "quote": string, "why": string}]}`;

function render(need: NeedInput, s: Pick<DraftSurvey, "title" | "intro" | "questions">): string {
  const qs = s.questions
    .map((q, i) => `${i + 1}. [${q.type}${q.low || q.high ? `, ${q.low ?? "?"} .. ${q.high ?? "?"}` : ""}] (${q.domain}) ${q.text}`)
    .join("\n");
  return [
    "HR NEED (may be in Catalan, Spanish or English; the survey must be in Catalan):",
    `Objective: ${need.objective}`,
    need.context ? `Context: ${need.context}` : null,
    need.exclusions ? `Must not ask about: ${need.exclusions}` : null,
    `Collective: ${need.collective ?? "all collectives"}`,
    need.maxSeconds ? `Time limit: ${need.maxSeconds}s (8 s per scale/yes-no, 30 s per open)` : null,
    "",
    `DRAFTED SURVEY\nTitle: ${s.title}\nIntro: ${s.intro}\nQuestions:\n${qs}`,
  ].filter((x) => x !== null).join("\n");
}

type Defect = { dimension: string; severity: "major" | "minor"; question: number; quote: string; why: string };

/** Score = 5 minus 2 per major and 1 per minor defect found in that dimension, floor 1. Defects whose quote is not in the survey are dropped. */
function score(x: unknown, surveyText: string): Judgement {
  const raw = (x as { defects?: unknown }).defects;
  if (!Array.isArray(raw)) throw new Error("no defects array");
  const hay = norm(surveyText);
  const defects: Defect[] = [];
  for (const d of raw as Defect[]) {
    if (!d || !(DIMENSIONS as readonly string[]).includes(d.dimension)) continue;
    const q = norm(String(d.quote ?? "")).replace(/["“”]/g, "");
    if (q.length < 3 || !hay.includes(q)) continue;
    defects.push({ dimension: d.dimension, severity: d.severity === "major" ? "major" : "minor", question: Number(d.question) || 0, quote: String(d.quote), why: String(d.why ?? "") });
  }
  const scores = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) {
    const mine = defects.filter((d) => d.dimension === dim);
    scores[dim] = Math.max(1, 5 - mine.reduce((a, d) => a + (d.severity === "major" ? 2 : 1), 0));
  }
  const penalty = defects.reduce((a, d) => a + (d.severity === "major" ? 2 : 1), 0);
  const worst = defects.find((d) => d.severity === "major") ?? defects[0];
  return { scores, overall: Math.max(1, 5 - penalty / 2), weakest: worst ? worst.quote : "", issues: defects.slice(0, 8).map((d) => `${d.dimension}/${d.severity}: "${d.quote}" - ${d.why}`.slice(0, 220)) };
}

export async function judge(need: NeedInput, s: Pick<DraftSurvey, "title" | "intro" | "questions">): Promise<Judgement> {
  let last: unknown;
  const body = render(need, s);
  for (let i = 0; i < 3; i++) {
    try {
      return score(await chatJson(RUBRIC, body, { temperature: 0, thinking: false, endpoint: "judge", maxTokens: 1500, timeoutMs: 90_000 }), body);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
