# Frontend audit (2026-11-07)

This audit looks at the frontend from three angles: the employee (PWA), HR, and a manager. Each finding names the file it lives in. The spot-checks were done against `jan/dev` at e5bb1f1. The "Owner" column says who has to act: **J** is Jan, **N** is Natan (engine, contract), **J+N** needs a contract entry first.

## P0: breaks the demo loop

All six are done and merged into `jan/dev` (2026-11-07): items 1 to 3 in `claude/need-ai-67d79d`, items 4 to 6 in `jan/p0-employee`.

| # | Finding | Where | Owner |
|---|---|---|---|
| 1 | The LLM drafter is slow and sometimes times out: 13 to 22 s per need, and 1 in 4 hits the 25 s timeout. The DCC guide says to turn thinking off with `chat_template_kwargs: {enable_thinking: false}` and to use `response_format: {type: "json_object"}`. There are no rate limits, so OpenRouter isn't needed. | `packages/ai/src/llm.ts` (need-ai worktree) | J| J, **done** |
| 2 | Follow-ups and "all collectives" needs publish to Fàbriques. `createFollowUp` passes `collectiuId: null`, and `publishNecessitat` falls back to `?? 1`. | `packages/db/src/hr-repository.ts:79,175` | J| J, **done** |
| 3 | A follow-up need is created without any questions. It never calls the AI drafter, so the signal-to-action loop stops at "Encara no hi ha preguntes redactades". | `hr-repository.ts:169-177` | J| J, **done** |
| 4 | The scale labels and range are wrong. Every scale5 says "Gens d'acord / Totalment d'acord", even when the question asks about frequency or satisfaction. Scale10 questions say "Del 0 al 10", but the UI renders 1 to 10, and the scale10 label layout breaks. | `(employee)/components/question-renderer.tsx:42`, `packages/seed/src/questions.ts` | J| J, **done** |
| 5 | The privacy page needs a login. Someone who is deciding whether to join can't read it. It also says "xifrada" (passwords are hashed, not encrypted) and doesn't mention `answer_ms` or that answers are linked over time. | `app/privacitat/page.tsx:23` | J| J, **done** |
| 6 | The PWA can't be installed: there's no manifest, no service worker, no icons and no `themeColor`. Without these there's no "add to home screen" and no iOS push. | `apps/web/public`, `app/layout.tsx` | J| J, **done** |

## P1: trust, privacy and correctness

| # | Finding | Where | Owner |
|---|---|---|---|
| 7 | The follow-up `n` counts answers, not respondents. Two questions × 5 people shows n=10 and passes the minimum group size. This is a privacy bug. | `packages/db/src/hr-signals.ts:155-159` | J+N (distinct-respondent column) |
| 8 | Participation on the home page reads low: the numerator counts only visible respondents, but the denominator is the whole population. | `hr-repository.ts` `getHrOverview` | J, **done**: numerator and denominator now cover the same visible collectives; the card says how many were hidden |
| 9 | The pool asks the same questions every day. Only questions answered today are excluded, so the "not 4 days in a row" rule is missing. | `packages/db/src/employee-repository.ts` `nextQuestionsForToday` | N (engine) or J if it stays in the repo |
| 10 | The day rolls over at UTC instead of Europe/Madrid time, so answers after 23:00 or 00:00 land on the wrong day. | `employee-repository.ts` `serverDate()` | J, **done** (Europe/Madrid day via `madrid-day.ts`; `pnpm --filter @damm/db run madrid-check`) |
| 11 | Signal status is never written (there's no `setSignalStatus`), and there's no way to close a need. The status badges never change. | `hr-repository.ts` | J, **done**: `setSignalStatus` + status buttons on `/hr/signals/[id]`; `closeNecessitat` + "Tanca la necessitat" on `/hr/publish` (uses `estat='tancada'`, no schema change) |
| 12 | Join-code account counts aren't suppressed below 10, and every code of one collective repeats the same count. | `hr-repository.ts:467-476` | J, **done**: counts under `MIN_GROUP_SIZE` show "<10"; the count appears once per collective |
| 13 | The HR routes have no access gate, and approving a recommendation doesn't record who approved it. That weakens the "a human decides" story. | `app/hr/*`, `hr-repository.ts` | J, **partly done**: access gate on `/hr/*` via `HR_ACCESS_CODE` (`proxy.ts`, `/hr-login`; empty = off). **Open, needs Natan:** recording who approved a recommendation needs new columns (`recomanacio.aprovada_per`, `aprovada_el`), a shared-contract change |
| 14 | The CSV export has no metadata (period, minimum n, suppression note) and no date in the filename. | `app/hr/results` export route | J, **done**: `#` metadata lines (period, generated at, minimum n, suppression note) and `resultats-agregats-YYYY-MM-DD.csv` |
| 15 | Some constants are hardcoded instead of using `MIN_GROUP_SIZE` and the rigour constants: `0.05` in the results page, `10` in `radar.tsx:135,143` and in settings. | `app/hr/results/*` | J, **done**: `REP_GAP_FLAG` (hr-rigour) and `MIN_GROUP_SIZE` replace the literals; there is no settings page, so nothing to change there |
| 16 | Employees can't skip a question. A forced answer hurts data quality and goes against the "voluntary" copy. | employee answer flow | J+N (skip in the contract) |
| 17 | Answer drafts are lost on reload, and the loading and error states are weak. | employee answer flow | J, **done** (drafts in localStorage, loading skeleton, retry on load and submit) |

## P2: polish and coverage

| # | Finding | Owner |
|---|---|---|
| 18 | There's no manager view: no read-only, collective-scoped dashboard (R-U-3, N-8). | J |
| 19 | There's no methodology page (precision bands, margin of error, suppression rule) linked from the results. | J |
| 20 | Onboarding and login use raw styles. Signup has friction: an 8-character password, no show toggle, and a 24-character recovery code with no copy button. | J |
| 21 | Accounts can't change the password, regenerate the recovery code or delete the account. | J |
| 22 | There's no manual join-code entry, only the link and QR. | J |
| 23 | Shift, centre and manager are never asked, so those segments are empty for real signups. | J+N |
| 24 | Lowercase `estat` and raw `tipus` reach the UI (recommendation badges). The copy is inconsistent ("1 minut" vs "2 minuts", mixed nav labels). | J |
| 25 | The need form fails silently on error. | J |
| 26 | The mobile HR nav has issues, there's a hardcoded red, and ChangeBadge and Sparkline are duplicated in `signals/[id]`. | J |
| 27 | The radar's fixed 1 to 5 scale hides small changes. | J |
| 28 | Accessibility gaps: focus states, labels on the scale buttons, contrast on subtle text. | J |
| 29 | The login rate limit lets anyone lock out a known username. | J |
| 30 | PII redaction only catches Catalan name patterns. Theme snippets depend on it. | J |

## Proposed order

1. **P0 batch (about 2 to 3 h):** items 1 to 6. Items 1 and 3 go together in the need-ai branch (the follow-up calls the drafter). Items 2, 4, 5 and 6 are independent and small.
2. **P1 batch:** items 8, 10, 11, 12, 13, 14 and 15 are Jan-only. For items 7, 9, 16 and 23, raise C3 or C4 contract entries with Natan first.
3. **P2:** do item 18 (manager view) and item 19 (methodology) first, because they're visible in the pitch. The rest is polish.
