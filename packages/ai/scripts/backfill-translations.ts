// Backfill: approved questions with a missing es or en wording get one from the LLM.
// Idempotent (existing es/en are never overwritten). Dry run by default; pass --apply to write.
// Usage (from packages/ai): DB_PATH=... LLM_BASE_URL=... LLM_API_KEY=... pnpm backfill-translations [-- --apply]
import { getDb } from "../../db/src/connection";
import { fillQuestionTranslations, getQuestionWording } from "../../db/src/hr-repository";
import { translateQuestionTexts } from "../src/translate";

const apply = process.argv.includes("--apply");
const BATCH = 8;

function missing(): { id: number; text: string; es: string; en: string }[] {
  const ids = getDb().prepare("SELECT id FROM pregunta WHERE estat = 'aprovada' ORDER BY id").all() as { id: number }[];
  const out: { id: number; text: string; es: string; en: string }[] = [];
  for (const { id } of ids) {
    const w = getQuestionWording(id);
    if (w && (!w.es || !w.en)) out.push({ id, ...w });
  }
  return out;
}

async function main() {
  const todo = missing();
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${todo.length} approved question(s) missing es or en`);
  for (const q of todo) console.log(`  #${q.id} es=${q.es ? "ok" : "missing"} en=${q.en ? "ok" : "missing"}`);

  if (apply) {
    let filled = 0;
    let failed = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const tr = await translateQuestionTexts(batch.map((q) => q.text));
      if (!tr) {
        failed += batch.length;
        console.log(`  batch ${i / BATCH + 1}: translation failed, left unchanged`);
        continue;
      }
      batch.forEach((q, j) => fillQuestionTranslations(q.id, tr[j].es, tr[j].en));
      filled += batch.length;
    }
    console.log(`filled ${filled}, failed ${failed}, still missing ${missing().length}`);
  } else {
    console.log("nothing written (use --apply)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
