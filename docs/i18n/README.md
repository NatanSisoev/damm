# Multi-language (N-6): Catalan, Spanish, English

Catalan is canonical. Everything falls back to Catalan, then to the key.

## Portal text
- Typed dictionaries in `apps/web/lib/i18n/*.ts`, built with `defineDict({ca, es, en})`: es and en must have the same keys as ca (checked by `tsc`). `{name}` placeholders are interpolated.
- Server: `getT(dict)` / `getTL(dict)` (also returns `lang`). Client: `useT(dict)` inside `LangProvider` (set in `app/layout.tsx`).
- Language: cookie `damm_lang`, else `Accept-Language`, else `ca`. `<LangSwitcher />` (onboarding, join, settings, HR nav, hr-login, manager) calls `setLanguageAction`; for a signed-in employee it also stores `compte.lang`. Login restores the cookie from `compte.lang`.
- Names of domains, collectives and shifts: `lib/i18n/names.ts`.
- To add a key: add it to `ca`, then `es` and `en`. To add a language: extend `LANGS` in `packages/shared/src/i18n.ts` and each dictionary.

## Questions
- `pregunta.text_i18n` = `{"ca","es","en"}` (NULL = use `text`); optional `i18n` per option in `options_json`; `compte.lang` default `ca`.
- `/api/pool/next` returns text and options already localized. The engine is untouched: translations are merged by question id and option index.
- Seed: `packages/seed/src/questions-i18n.ts`. Engine bank: `question-bank-translations.json` here, applied by `applyBankTranslations` at start-up (by normalised text) until Natan adopts it in the bank.
- AI drafting adds es/en in a second pass (`packages/ai/src/translate.ts`); HR reviews and edits them in `/hr/needs` before approving.

## Not translated
Text produced into the DB by jobs or HR (theme names, signal titles, recommendations, need text), drafted scale anchors, the brand "Escolta activa".

## HR need form: time per person

The "Durada màxima per persona" number input is now a 1/2/3/5 min choice (submits 60/120/180/300 s, default 2 min) with a live hint of how many questions fit (seconds / 8). No contract change: `actions.ts` and `packages/ai` still take seconds, and the server keeps its 30 s minimum.
