"use client";

import type { PoolNextResponse } from "@damm/shared";
import { OpenInput } from "./open-input";
import { parseRanking, RankingInput } from "./ranking-input";
import { ScaleInput } from "./scale-input";
import { SwipeInput } from "./swipe-input";

export type PoolQuestion = PoolNextResponse["preguntes"][number];

/** Answer state held by the flow: a number for scales, swipe and ranking; text for obert. */
export type AnswerDraft = { valorNum: number | null; comentari: string };
export const EMPTY_DRAFT: AnswerDraft = { valorNum: null, comentari: "" };

export function isAnswerable(q: PoolQuestion, d: AnswerDraft): boolean {
  return q.tipus === "obert" ? d.comentari.trim().length > 0 : d.valorNum !== null;
}

export function QuestionRenderer({
  question,
  draft,
  onChange,
}: {
  question: PoolQuestion;
  draft: AnswerDraft;
  onChange: (d: AnswerDraft) => void;
}) {
  const setNum = (v: number | null) => onChange({ ...draft, valorNum: v });

  switch (question.tipus) {
    case "escala5":
      return (
        <Block text={question.text}>
          <ScaleInput max={5} value={draft.valorNum} onChange={setNum} lowLabel="Gens d'acord" highLabel="Totalment d'acord" />
        </Block>
      );
    case "escala10":
      return (
        <Block text={question.text}>
          <ScaleInput max={10} value={draft.valorNum} onChange={setNum} lowLabel="1 · Gens" highLabel="10 · Moltíssim" />
        </Block>
      );
    case "swipe":
      return <SwipeInput text={question.text} value={draft.valorNum} onChange={setNum} />;
    case "ranking": {
      const { prompt, options } = parseRanking(question.text);
      if (options.length < 2) {
        // Free-form wording without a list of options: fall back to a 1-5 priority scale.
        return (
          <Block text={question.text}>
            <ScaleInput max={5} value={draft.valorNum} onChange={setNum} lowLabel="1 · Màxima prioritat" highLabel="5 · Mínima" />
          </Block>
        );
      }
      return (
        <Block text={prompt}>
          {/* key: reset local order when the question changes */}
          <RankingInput key={question.id} options={options} onChange={setNum} />
        </Block>
      );
    }
    case "obert":
      return (
        <Block text={question.text}>
          <OpenInput value={draft.comentari} onChange={(c) => onChange({ ...draft, comentari: c })} />
        </Block>
      );
  }
}

function Block({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold leading-7 tracking-tight">{text}</h2>
      {children}
    </div>
  );
}
