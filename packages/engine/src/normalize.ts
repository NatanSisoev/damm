// Raw answer → common answer space. See docs/engine.md section 2 and docs/question-types.md.
import type { QuestionType, RankingOption, ScoredOption } from "@damm/shared";

export interface QuestionDef {
  id: number;
  domainId: number;
  collectiuId: number | null;
  type: QuestionType;
  text: string;
  facet: string; // falls back to `q<id>` when the question has no facet
  polarity: 1 | -1;
  options: ScoredOption[] | RankingOption[] | null;
  isFollowup: boolean;
  needId: number | null;
  priority: number;
}

export interface RawAnswer {
  valorNum?: number | null;
  valueJson?: number[] | null;
  comentari?: string | null;
}

export interface ParsedAnswer {
  valorNum: number | null;
  valueJson: number[] | null;
  /** 0..1, 1 = best. null for ranking and open. */
  score: number | null;
}

export type ParseResult = { ok: true; value: ParsedAnswer } | { ok: false; reason: "invalid_value" | "missing_comment" };

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

export function parseAnswer(q: QuestionDef, a: RawAnswer): ParseResult {
  const v = a.valorNum;
  const bad = { ok: false, reason: "invalid_value" } as const;
  const scored = (valorNum: number, raw: number, flip: boolean): ParseResult => ({
    ok: true,
    value: { valorNum, valueJson: null, score: flip && q.polarity === -1 ? 1 - raw : raw },
  });
  switch (q.type) {
    case "scale5":
      return isInt(v) && v >= 1 && v <= 5 ? scored(v, (v - 1) / 4, true) : bad;
    case "scale10":
      return isInt(v) && v >= 0 && v <= 10 ? scored(v, v / 10, true) : bad;
    case "yes_no":
      return v === 0 || v === 1 ? scored(v, v, true) : bad;
    case "pair":
    case "choice": {
      const opts = (q.options ?? []) as ScoredOption[];
      const opt = isInt(v) ? opts[v] : undefined;
      return opt && typeof opt.score === "number" ? scored(v as number, opt.score, false) : bad;
    }
    case "ranking": {
      const k = q.options?.length ?? 0;
      const order = a.valueJson;
      if (!Array.isArray(order) || order.length !== k || k < 2) return bad;
      const seen = new Set(order);
      if (seen.size !== k || !order.every((i) => isInt(i) && i >= 0 && i < k)) return bad;
      return { ok: true, value: { valorNum: null, valueJson: [...order], score: null } };
    }
    case "open":
      return typeof a.comentari === "string" && a.comentari.trim().length > 0
        ? { ok: true, value: { valorNum: null, valueJson: null, score: null } }
        : { ok: false, reason: "missing_comment" };
  }
}

/** Ranking order (option indices, best first) → Borda weight per domain: first = 1, last = 0. */
export function bordaWeights(options: RankingOption[], order: number[]): Map<number, number> {
  const k = order.length;
  const out = new Map<number, number>();
  order.forEach((optIdx, pos) => {
    const opt = options[optIdx];
    if (opt) out.set(opt.domainId, k === 1 ? 1 : (k - 1 - pos) / (k - 1));
  });
  return out;
}

/** Parses options_json from the DB. Ranking options use domain_id in storage, domainId in code. */
export function parseOptions(type: QuestionType, json: string | null): ScoredOption[] | RankingOption[] | null {
  if (!json) return null;
  const raw = JSON.parse(json) as Array<Record<string, unknown>>;
  if (type === "ranking")
    return raw.map((o) => ({ label: String(o.label), domainId: Number(o.domain_id ?? o.domainId) }));
  return raw.map((o) => ({ label: String(o.label), score: Number(o.score) }));
}
