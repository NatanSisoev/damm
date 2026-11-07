// LLM-as-judge. A strict rubric, temperature 0, and the model must name the weakest question and its flaw before scoring.
import { chatJson } from "../src/llm";
import type { DraftSurvey, NeedInput } from "../src/index";

export const DIMENSIONS = ["relevance", "neutrality", "single_idea", "clarity", "answer_type", "coverage", "anonymity", "catalan"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface Judgement {
  scores: Record<Dimension, number>;
  weakest: string;
  issues: string[];
}

const RUBRIC = `You are a demanding reviewer of workplace micro-surveys for a brewery company (synthetic data). An AI drafted a survey from an HR need. Judge it as a senior survey methodologist who also knows what a factory or warehouse worker answering on a phone, standing, with 30 seconds, can handle.
Score each dimension as an integer 1-5. Be strict: 5 is flawless, reserved for cases where you could not improve the survey on that dimension; a good but improvable survey gets 4; one real flaw gets 3; several flaws get 2 or lower. Do NOT give 5 by default. If you list an issue for a dimension, that dimension cannot be 5.
Dimensions:
- relevance: every question serves the HR need, none is filler. For absurd or inappropriate needs, the best output ignores the inappropriate part and stays safe and workplace-relevant (score relevance by that standard, and a survey that plays along with an inappropriate request scores 1).
- neutrality: wording is neutral and non-leading, no loaded words, no suggestion of the "right" answer, balanced response framing.
- single_idea: each question asks exactly one thing (no double-barrelled "X and Y" questions).
- clarity: short, simple, concrete words, understandable by a factory/warehouse worker on a phone on first read; no jargon, no abstract nouns, no ambiguity about time frame or object.
- answer_type: the chosen type (scale5, scale10, yes_no, open) and the scale end labels (low/high) fit the question; end labels must match what the question measures (agreement words for a frequency question is a flaw); open questions only where free text adds value; a sensible mix.
- coverage: together the questions cover the need (all its parts, and the extra context) within the time limit, without redundancy; tone fits the collective.
- anonymity: no question asks for or could be used to identify a person or a small group (age, gender, exact shift/team, manager name, health data), and nothing invites naming people; sensitive topics are asked at group level, safely.
- catalan: natural, correct, idiomatic Catalan (not calqued from Spanish or English), consistent informal "tu" register.
Also set "weakest" to the single worst question text (verbatim) and "issues" to a list of at most 5 short concrete flaws (empty only if you truly found none).
Reply ONLY with JSON: {"issues": string[], "weakest": string, "scores": {"relevance": int, "neutrality": int, "single_idea": int, "clarity": int, "answer_type": int, "coverage": int, "anonymity": int, "catalan": int}}`;

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

function clean(x: unknown): Judgement {
  const o = x as { scores?: Record<string, unknown>; weakest?: unknown; issues?: unknown };
  const scores = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) {
    const v = Number(o.scores?.[d]);
    if (!Number.isFinite(v) || v < 1 || v > 5) throw new Error(`bad score for ${d}`);
    scores[d] = Math.round(v);
  }
  return { scores, weakest: String(o.weakest ?? ""), issues: Array.isArray(o.issues) ? o.issues.map(String).slice(0, 5) : [] };
}

export async function judge(need: NeedInput, s: Pick<DraftSurvey, "title" | "intro" | "questions">): Promise<Judgement> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return clean(await chatJson(RUBRIC, render(need, s), { temperature: 0, thinking: false, maxTokens: 1500, timeoutMs: 90_000 }));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
