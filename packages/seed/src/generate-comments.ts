// Generates data/comments.json ONCE; the seed only reads the committed JSON, so nobody needs a key.
//   pnpm --filter @damm/seed run comments            template-based, deterministic, no network
//   pnpm --filter @damm/seed run comments -- --llm   OpenAI-compatible LLM (env LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
// The key is read from the environment only. Never commit it.
import fs from "node:fs";
import path from "node:path";
import { mulberry32, shuffle, chance, pick, type Rng } from "./rng";
import { THEMES, type ThemeDef } from "./themes";
import { CORES, PREFIXES, SUFFIXES, PII_SUFFIXES } from "./comment-bank";

export interface CommentEntry {
  id: string;
  tema: string; // hidden theme label (resposta_seed.tema_real)
  text: string; // redacted form, this is what goes into resposta.comentari
  text_raw?: string; // only for entries that contain FAKE PII, for redaction tests
  pii?: true;
}

const out = path.resolve(__dirname, "../data/comments.json");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function templateForTheme(r: Rng, t: ThemeDef): Omit<CommentEntry, "id">[] {
  const cores = CORES[t.id];
  const combos: string[] = [];
  for (const core of cores) for (const p of PREFIXES) for (const s of SUFFIXES) combos.push(`${p}\u0000${core}\u0000${s}`);
  const chosen = shuffle(r, combos);
  const seen = new Set<string>();
  const res: Omit<CommentEntry, "id">[] = [];
  // Each core is used at most ceil(count / cores) times so phrasing stays varied.
  const used = new Map<string, number>();
  const limit = Math.ceil(t.count / cores.length);
  for (const c of chosen) {
    if (res.length >= t.count) break;
    const [p, core, s] = c.split("\u0000");
    if ((used.get(core) ?? 0) >= limit) continue;
    const body = p ? `${p}${core}` : cap(core);
    const text = `${body}${s.startsWith(".") || s === "" ? (s === "" ? "." : s) : "." + s}`;
    if (seen.has(text)) continue;
    seen.add(text);
    used.set(core, (used.get(core) ?? 0) + 1);
    res.push({ tema: t.id, text });
  }
  return res;
}

function buildTemplate(): CommentEntry[] {
  const r = mulberry32(777);
  let all: Omit<CommentEntry, "id">[] = [];
  for (const t of THEMES) all.push(...templateForTheme(r, t));
  // Add fake PII to 10 general comments.
  const generals = all.map((c, i) => i).filter((i) => THEMES.find((t) => t.id === all[i].tema)?.kind === "general");
  const targets = shuffle(r, generals).slice(0, PII_SUFFIXES.length);
  targets.forEach((i, k) => {
    const c = all[i];
    const base = c.text.replace(/\.$/, ".");
    all[i] = { tema: c.tema, text: base + PII_SUFFIXES[k].red, text_raw: base + PII_SUFFIXES[k].raw, pii: true };
  });
  all = shuffle(r, all);
  return all.map((c, i) => ({ id: `c${String(i + 1).padStart(3, "0")}`, ...c }));
}

async function buildLlm(): Promise<CommentEntry[]> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!base || !key || !model) throw new Error("Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in the environment.");
  const r = mulberry32(777);
  const all: Omit<CommentEntry, "id">[] = [];
  for (const t of THEMES) {
    const hint = (CORES[t.id] ?? []).slice(0, 4).join("; ");
    const prompt =
      `Genera ${t.count} comentaris curts (una frase, màxim 25 paraules), en català, d'empleats d'una empresa cervesera ` +
      `fictícia, sobre el tema "${t.label}". Mescla opinions positives i negatives, to col·loquial. Dades 100% sintètiques, ` +
      `sense noms ni telèfons reals. Exemples d'idees: ${hint}. Respon NOMÉS un array JSON de ${t.count} strings.`;
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.9, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status} for ${t.id}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const txt = body.choices[0].message.content;
    const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)) as string[];
    if (arr.length < t.count) throw new Error(`LLM returned ${arr.length}/${t.count} for ${t.id}`);
    arr.slice(0, t.count).forEach((text) => all.push({ tema: t.id, text }));
  }
  return shuffle(r, all).map((c, i) => ({ id: `c${String(i + 1).padStart(3, "0")}`, ...c }));
}

async function main() {
  const useLlm = process.argv.includes("--llm");
  const comments = useLlm ? await buildLlm() : buildTemplate();
  const meta = {
    generator: useLlm ? "llm" : "template",
    note: "Synthetic comments. Hidden theme label per entry. Entries with pii=true carry FAKE PII in text_raw for redaction tests; text is the redacted form.",
    total: comments.length,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ meta, comments }, null, 1) + "\n");
  console.log(`Wrote ${comments.length} comments (${meta.generator}) to ${out}`);
}

if (require.main === module) main();
void chance; void pick;
