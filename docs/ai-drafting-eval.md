# AI need drafting: eval log

Covers R-FLOW-2a..2g (draft questions from a need, review, redraft) and R-FLOW-3 (publish pool). Code: `packages/ai` (`draftSurvey`, `redraftQuestion`, `quality.ts`, `fallback.ts`) and `packages/ai/eval`.

## Method

- 38 synthetic needs in `packages/ai/eval/cases.json` (vague, Spanish and English input, exclusions, identifying or leading requests, tight and loose time budgets, follow-ups, off-topic). No real data.
- Run: `pnpm --filter @damm/ai run eval --label <name> [--redraft] [--no-judge] [--only id,id] [--controls] [--final]` (flags go directly, no `--`). Output goes to `packages/ai/eval/results/` (`run-*` is gitignored; `report.md` and `*.out` are local too and not committed).
- **Deterministic checks** (`eval/checks.ts`): schema, question count and time budget per collective, word limits, at most N open questions, anchors match the question, no identifying or leading wording, exclusions respected, coverage of the case's required topics, Catalan errors, gender mix, intro question count, near-duplicates. Fail checks must pass or be justified in `expect.justify`. Warnings are informational.
- **LLM judge** (`eval/judge.ts`): lists defects (dimension, severity, quote, why). Quotes not found in the survey are dropped. Score per dimension = `max(1, 5 - 2*major - 1*minor)`, survey overall = `max(1, 5 - penalty/2)`. Dimensions: relevance, neutrality, single_idea, clarity, answer_type, coverage, anonymity, catalan. Temperature 0. Three deliberately bad control surveys must score 2 or less (all score 1.00 with both judges).
- Judge endpoint: the product path stays on `ornith` (`LLM_*`). The judge can use a stronger model via `JUDGE_BASE_URL`, `JUDGE_API_KEY`, `JUDGE_MODEL` in `.env` (used: OpenRouter, `anthropic/claude-opus-5.5`, synthetic needs only). `AI_EVAL_DRAFT_ON_JUDGE=1` would also draft on that endpoint (full model A/B). **Not run.**

## What changed per round

| Round | Change |
|---|---|
| baseline | First draft prompt, no repair, no post-processing. Old judge. |
| r1 | Repair loop (problems fed back to the model, up to 2 repairs), anchors, time trim, fallback padding, harness. |
| r2 | Prompt tightening, JSON mode, thinking off. Fewer and looser checks. |
| r3 | Judge rewritten (defect list, quote verification, controls). New checks: Catalan errors, gender mix, anchor wording. Gender-neutral Catalan in the prompt. Per-kind scale anchors. Redraft: different first words, 3 rounds. |
| r4 | Incomplete-word pattern narrowed (no false Catalan errors on valid words), warning only for texts of 4+ words. |
| r5 | Ornith judge, bad `JUDGE_MODEL` value, no judge scores (n/a). |
| r6 | Opus judge on the r4-era drafts. Found intro/question-count mismatches and garbled Catalan that ornith missed. |
| final | `toCatalan` map (turnos, horario, equipo...) on title and intro, `fixCount` for the intro question count, `intro-count` check. Opus judge. |

## Numbers (38 cases)

| Run | All checks pass | Fallback | p50 latency | Judge avg |
|---|---|---|---|---|
| baseline | 0/38 (old checks, before repair) | 2.6% | 4.4 s | 3.46 (old judge) |
| r1 | 31/38 | 0 | 7.4 s | 3.43 (old judge) |
| r2 | 34/38 | 0 | 3.8 s | 3.46 (old judge) |
| r3 | 28/38 | 0 | 5.8 s | 2.53 (ornith judge, new rubric) |
| r4 | 33/38 | 0 | 4.5 s | 2.47 (ornith judge) |
| r6 | 33/38 | 0 | 5.8 s | 2.66 (Opus judge) |
| final | 32/38 | 0 | 6.3 s | 2.83 (Opus judge) |

Read this carefully:

- **Pass counts are not comparable across rows.** r2 passes more only because it had fewer and looser checks. r3 onwards adds the Catalan, gender, anchor and intro-count checks. The baseline's 0/38 is against the same checks as r1/r2, not the later ones.
- **The judge average is not comparable across the rubric change** (3.4x old judge vs 2.4-2.8 new). The new rubric is penalty-based and stricter. The 4.5 target is **not met** (final 2.83). It is reported, but the deterministic checks are the real gate, as agreed with the orchestrator.
- Final failures (6 cases): coverage 3, time budget 2, exclusion 1, Catalan error 1 (a case can fail several). Zero fallbacks.
- p50 latency is 6.3 s, above the 5 s target. It varies run to run with `ornith` load (r2 3.8 s, final 6.3 s); one case took 32 s.
- Final Opus judge dimension averages: relevance 4.53, neutrality 4.71, single_idea 4.82, clarity 4.03, answer_type 4.34, coverage 3.97, anonymity 4.95, catalan 4.24. Dimension minimum is under 4 in most dimensions, so "no dimension under 4" is **not met**.

## Ornith judge vs Opus judge (same drafts, r4 vs r6 era)

| Dimension | Ornith (r4) | Opus (r6) |
|---|---|---|
| relevance | 3.92 | 4.71 |
| answer_type | 3.24 | 4.47 |
| clarity | 5.00 | 3.66 |
| catalan | 4.21 | 4.03 |
| coverage | 3.71 | 3.82 |
| overall | 2.47 | 2.66 |

The ornith judge is noisy on relevance and answer_type (it flags correct question/scale pairings) and blind on clarity (a flat 5.00). The Opus judge found real defects ornith missed: garbled Catalan phrasing and an intro that claimed a different question count than the survey held (now fixed and checked deterministically). Both give the control surveys 1.00. Recommendation: judge with a stronger model than the drafter, use the defect lists to find problems, and do not read the absolute average as a quality score.

## redraftQuestion

All 38 redrafts are different from the current question (the old code sometimes returned a near-copy). But only 25 of 38 pass every check, and the Opus judge scored the replacement higher than the original in only 10 of 38 (avg 2.83 before, 2.72 after). So "different and non-duplicate" holds; "better" does **not** reliably hold. One redraft (case 04) came back in Spanish ("Sabes com quedarà..."), which the redraft path does not catch.

## Remaining weaknesses

- Coverage misses on a few cases (the draft skips a required topic).
- Two time-budget overruns that the trim does not fix.
- Occasional garbled Catalan ("Quins canviaries de l'ambient de treball?"). `catalan` warnings fire on most cases (warnings only).
- Redraft: can answer in Spanish, and is not reliably better than the original.
- `ornith` latency is variable and sometimes above 5 s.
- Only the draft endpoint `ornith` has been used for drafting. A stronger drafting model has not been compared.

## Limits

- 38 synthetic cases, one run per label, `ornith` is non-deterministic, so differences of one or two cases are noise.
- The checks and the judge were tuned on the same 38 cases (some overfitting risk).
- Judge scores come from one model at temperature 0, and the rubric changed between r2 and r3.

## options_json gap (not fixed here)

`docs/engine.md` says that when the AI drafts a question it proposes the option scores (`pregunta.options_json`) and HR approves them. The drafting AI does not do this: it only drafts `scale5`, `yes_no` and `open` questions (with `low`/`high` anchors), and never `pair`, `choice` or `ranking` questions with `options_json` (scored options, or `domain_id` per ranking option). `validateQuestion` (see `docs/engine-integration.md`) therefore never sees AI-drafted options. This touches the shared contract (`packages/shared`, `packages/db`) and Natan's engine, so it was not changed here. Left for Jan to coordinate with Natan.

## How to repeat

```
source ~/.claude/bin/heavy-gate.sh
pnpm --filter @damm/ai run eval --label mine --redraft
```

Set `JUDGE_*` in `.env` for a stronger judge. Never commit `.env` or print the keys.
