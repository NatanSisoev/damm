"use client";

import type { PoolNextResponse } from "@damm/shared";
import { OpenInput } from "./open-input";
import { parseRanking, RankingInput } from "./ranking-input";
import { ScaleInput } from "./scale-input";
import { SwipeInput } from "./swipe-input";

export type PoolQuestion = PoolNextResponse["preguntes"][number];

/**
 * Answer state held by the flow: a number for scales, yes/no, pair and choice (the option index)
 * and ranking (position of the first option, plus the full order); text for open.
 */
export type AnswerDraft = { valorNum: number | null; comentari: string; valueJson: number[] | null };
export const EMPTY_DRAFT: AnswerDraft = { valorNum: null, comentari: "", valueJson: null };

function optionLabels(q: PoolQuestion): string[] {
  return (q.options ?? []).map((o) => o.label);
}

/** Scale anchors travel in options: first label = low end, last label = high end. */
function anchors(labels: string[], low: string, high: string): [string, string] {
  return labels.length >= 2 ? [labels[0], labels[labels.length - 1]] : [low, high];
}

export function isAnswerable(q: PoolQuestion, d: AnswerDraft): boolean {
  return q.tipus === "open" ? d.comentari.trim().length > 0 : d.valorNum !== null;
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
  const labels = optionLabels(question);

  switch (question.tipus) {
    case "scale5": {
      const [low, high] = anchors(labels, "Mínim", "Màxim");
      return (
        <Block text={question.text}>
          <ScaleInput max={5} value={draft.valorNum} onChange={setNum} lowLabel={low} highLabel={high} />
        </Block>
      );
    }
    case "scale10": {
      const [low, high] = anchors(labels, "Mínim", "Màxim");
      return (
        <Block text={question.text}>
          <ScaleInput min={0} max={10} value={draft.valorNum} onChange={setNum} lowLabel={low} highLabel={high} />
        </Block>
      );
    }
    case "yes_no":
      return <SwipeInput text={question.text} value={draft.valorNum} onChange={setNum} />;
    case "pair":
    case "choice":
      return (
        <Block text={question.text}>
          <ChoiceInput options={labels} value={draft.valorNum} onChange={setNum} twoUp={question.tipus === "pair"} />
        </Block>
      );
    case "ranking": {
      // Options come from options_json; older items list them in the text after a colon.
      const parsed = parseRanking(question.text);
      const { prompt, options } = labels.length >= 2 ? { prompt: question.text, options: labels } : parsed;
      if (options.length < 2) {
        // Free-form wording without a list of options: fall back to a 1-5 priority scale.
        return (
          <Block text={question.text}>
            <ScaleInput max={5} value={draft.valorNum} onChange={setNum} lowLabel="Màxima prioritat" highLabel="Mínima" />
          </Block>
        );
      }
      return (
        <Block text={prompt}>
          {/* key: reset local order when the question changes */}
          <RankingInput
            key={question.id}
            options={options}
            onChange={(pos, order) =>
              onChange({ ...draft, valorNum: pos, valueJson: labels.length >= 2 ? order : null })
            }
          />
        </Block>
      );
    }
    case "open":
      return (
        <Block text={question.text}>
          <OpenInput value={draft.comentari} onChange={(c) => onChange({ ...draft, comentari: c })} />
        </Block>
      );
  }
}

function ChoiceInput({
  options,
  value,
  onChange,
  twoUp,
}: {
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
  twoUp: boolean;
}) {
  return (
    <div role="radiogroup" className={twoUp ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2"}>
      {options.map((label, i) => {
        const on = value === i;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(i)}
            className={`card min-h-14 px-4 py-3 text-left text-base transition ${
              on ? "!border-accent border-2 bg-accent-soft font-semibold" : "hover:border-line-strong"
            } ${twoUp ? "flex items-center justify-center text-center font-medium" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Block({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-extrabold leading-8 tracking-tight">{text}</h2>
      {children}
    </div>
  );
}
