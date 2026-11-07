const STOP = new Set([
  "sobre", "entre", "perquè", "aquest", "aquesta", "aquests", "aquestes", "temes", "tema", "preguntes", "pregunta",
  "demanar", "preguntar", "ningú", "cap", "dels", "amb", "sense", "també", "això", "cada", "molt", "però",
  "para", "pero", "como", "cual", "with", "about", "that", "this", "from",
]);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** First 5 letters act as a crude stem ("salari", "salaris", "salarial" all match). */
function stems(phrase: string): string[] {
  return norm(phrase)
    .split(/[^a-z0-9·]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

/**
 * True when the question clearly asks what an exclusion forbids: every significant word
 * (up to two) of at least one exclusion phrase appears in the question. Conservative on purpose.
 */
export function violatesExclusions(text: string, exclusions: string | null | undefined): boolean {
  if (!exclusions?.trim()) return false;
  const q = norm(text);
  return exclusions
    .split(/[\n;,.]+/)
    .map((p) => stems(p).slice(0, 2))
    .filter((s) => s.length > 0)
    .some((s) => s.every((stem) => q.includes(stem)));
}
