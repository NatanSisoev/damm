"use client";

import { useState } from "react";

// ranking: `valor_num` is the position (1 = top priority) the person gives to the FIRST option,
// kept for the legacy aggregate. The full order (option indices, best first) goes in `valueJson`.

/** "Ordena què valores: escolta, claredat, justícia." -> prompt + options. */
export function parseRanking(text: string): { prompt: string; options: string[] } {
  const i = text.indexOf(":");
  if (i < 0) return { prompt: text, options: [] };
  const options = text
    .slice(i + 1)
    .replace(/[.?!\s]+$/, "")
    .split(/,|\s+i\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { prompt: text.slice(0, i), options };
}

export const RANKING_MAX = 5;

export function RankingInput({
  options,
  onChange,
}: {
  options: string[];
  onChange: (positionOfFirst: number | null, order: number[]) => void;
}) {
  const [order, setOrder] = useState(options.map((_, i) => i));
  const [touched, setTouched] = useState(false);

  const commit = (next: number[]) => {
    setOrder(next);
    setTouched(true);
    onChange(next.indexOf(0) + 1, next);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  };

  return (
    <div>
      <ol className="flex flex-col gap-2">
        {order.map((optIdx, pos) => (
          <li key={optIdx} className="card flex items-center gap-3 px-3 py-2">
            <span className="num flex h-8 w-8 items-center justify-center bg-surface-muted text-sm font-semibold">
              {pos + 1}
            </span>
            <span className="flex-1 text-base capitalize">{options[optIdx]}</span>
            <button
              type="button"
              aria-label={`Puja ${options[optIdx]}`}
              disabled={pos === 0}
              onClick={() => move(pos, pos - 1)}
              className="h-11 w-11 rounded-lg border border-line-strong bg-surface text-lg disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Baixa ${options[optIdx]}`}
              disabled={pos === order.length - 1}
              onClick={() => move(pos, pos + 1)}
              className="h-11 w-11 rounded-lg border border-line-strong bg-surface text-lg disabled:opacity-30"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      {!touched && (
        <button type="button" onClick={() => commit(order)} className="mt-3 text-sm text-muted underline">
          Deixa l&apos;ordre així
        </button>
      )}
    </div>
  );
}
