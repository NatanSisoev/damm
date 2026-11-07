# C3 draft: AI question drafting (additive schema changes)

Branch `claude/need-ai-67d79d`. Covers R-FLOW-1c, 1e, 2a, 2b, 2c, 2d, 2f, 2g, 3c. Jan turns this into a C3 entry.

## Schema changes (all additive, nullable or defaulted)

In `packages/db/schema.sql`, marked "C3 draft":

| Table | Column | Type | Why |
|---|---|---|---|
| `necessitat` | `context` | `TEXT` | Context field of the need form |
| `necessitat` | `titol` | `TEXT` | Survey title proposed by the AI (editable) |
| `necessitat` | `intro` | `TEXT` | Survey intro proposed by the AI (editable) |
| `necessitat` | `draft_font` | `TEXT CHECK IN ('llm','fallback')` | Whether the drafts came from the LLM or from the template fallback |
| `pregunta` | `motiu` | `TEXT` | One-line reason per question (shown in Revisió) |
| `pregunta` | `ordre` | `INTEGER NOT NULL DEFAULT 0` | Order of drafts within a need (reordering) |

`necessitat.exclusions` already existed and is now filled from the "what must not be asked" field.

No clash with Natan's schema as far as his branch shows (he renames `tipus` values and adds engine columns; none of the six names above).

## Temporary type mapping (delete after Natan's PR merges)

The AI package emits English types. `packages/db/src/hr-repository.ts` maps them on save and back on read (`TIPUS_FROM_AI`, `TIPUS_TO_AI`, marked TEMPORARY (C3)):

| AI | Stored today |
|---|---|
| `scale5` | `escala5` |
| `scale10` | `escala10` |
| `yes_no` | `swipe` |
| `open` | `obert` |
| `ranking` | `ranking` (not generated yet: options are not modelled in drafts) |

## Action items for Natan

1. After your type rename merges, delete both maps and store the AI types as they are (one commit in `hr-repository.ts`).
2. Check that the engine ignores `draft` questions and tolerates `ordre = 0` and null `motiu`.
3. Confirm no other use of the six new column names on your side.
4. Decide whether `ranking` needs an options column; until then the AI never generates it.

## Boundaries kept

- `@damm/ai` imports only `@damm/shared` and zod; `scripts/check-anonymity.mjs` check (d) fails if it ever imports `@damm/db*` or a SQLite driver.
- HR code may import `@damm/ai`; no ESLint rule was loosened.
- The LLM is called only from the create/regenerate server actions, never from a dashboard read path. Nothing is approved automatically.
