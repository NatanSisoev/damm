// PII redaction for open comments (regex, local, deterministic, ca/es/en). Runs before anything is
// stored. Best-effort: it catches the shapes below, it is not a guarantee. The UI still tells
// people not to include personal data. Tokens: [correu] [compte] [DNI] [id] [telèfon] [nom].

const NAME_TOKEN = /[\p{L}'’-]+/gu;
const isCap = (w: string) => /^\p{Lu}\p{Ll}/u.test(w);
const PARTICLES = new Set(["de", "del", "la", "los", "las", "i", "y", "van", "von", "da", "di"]);
const ARTICLES = new Set(["en", "na", "el", "la", "don", "doña", "dona", "l'", "l’"]);

// Capitalised words that are not people: collectives, domains, product and tool names, calendar
// words and common sentence openers. Compared lowercase.
const NOT_NAMES = new Set(
  [
    // collectives and domains
    "fàbriques", "fàbrica", "fabriques", "fábricas", "fábrica", "logística", "logistica", "comercial",
    "oficines", "oficina", "oficinas", "benestar", "bienestar", "lideratge", "liderazgo", "desenvolupament",
    "desarrollo", "cultura", "pertinença", "pertenencia", "entorn", "entorno", "relacions", "relaciones",
    "condicions", "condiciones", "organització", "organización", "manager", "gerents",
    // company and tools
    "damm", "estrella", "teams", "whatsapp", "excel", "word", "outlook", "sap", "google", "windows", "zoom",
    // calendar
    "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge", "lunes", "martes",
    "miércoles", "jueves", "viernes", "sábado", "domingo", "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday", "gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost",
    "setembre", "octubre", "novembre", "desembre", "enero", "febrero", "marzo", "mayo", "junio", "julio",
    "agosto", "septiembre", "noviembre", "diciembre", "january", "february", "march", "april", "june", "july",
    "august", "september", "october", "november", "december", "aug", "sep", "oct",
    // sentence openers and function words
    "the", "this", "that", "we", "they", "he", "she", "it", "yes", "no", "sí", "si", "però", "pero", "but",
    "and", "i", "el", "la", "els", "les", "un", "una", "this", "when", "quan", "cuando", "perquè", "porque",
    "because", "also", "també", "también", "molt", "muy", "very", "not", "tired", "happy", "feliz",
  ],
);
// Lowercase words that cannot start a name after a strong "my name is"-style lead.
const NOT_FIRST_LOWER = new Set([
  "que", "això", "així", "per", "a", "de", "com", "quan", "si", "no", "molt", "porque", "pero", "muy", "not",
  "very", "so", "and", "but", "the", "an", "en", "na", "el", "la", "del", "un", "una", "tired", "happy",
]);

interface Opts {
  min: number; // minimum name words to redact
  lowerFirst?: boolean; // first name word may be lowercase ("em dic joan")
}

/** Redacts the name words at the start of `rest`; returns the replacement for the whole match. */
function redactNameRun(lead: string, gap: string, rest: string, opts: Opts): string {
  const toks = [...rest.matchAll(NAME_TOKEN)].map((m) => ({ w: m[0], start: m.index!, end: m.index! + m[0].length }));
  let i = 0;
  // Optional personal article ("en Joan", "la Maria", "don Pedro").
  if (toks[i] && ARTICLES.has(toks[i].w.toLowerCase()) && toks[i + 1]) i += 1;
  const first = i;
  let count = 0;
  let end = -1;
  for (; i < toks.length && count < 4; i++) {
    const { w } = toks[i];
    const lw = w.toLowerCase().replace(/['’]s$/, "");
    if (count === 0) {
      const ok = isCap(w) ? !NOT_NAMES.has(lw) : opts.lowerFirst && w.length > 1 && !NOT_FIRST_LOWER.has(lw);
      if (!ok) break;
    } else if (isCap(w)) {
      if (NOT_NAMES.has(lw)) break;
    } else if (PARTICLES.has(lw) && toks[i + 1] && isCap(toks[i + 1].w) && !NOT_NAMES.has(toks[i + 1].w.toLowerCase().replace(/['’]s$/, ""))) {
      continue; // particle inside a surname ("de la Torre"), counted with the next word
    } else break;
    count += 1;
    end = toks[i].end;
  }
  if (count < opts.min || end < 0) return lead + gap + rest;
  return `${lead}${gap}[nom]${rest.slice(end)}`;
}

const REST = String.raw`((?:[\p{L}'’-]+[ \t]+){0,5}[\p{L}'’-]+)`;
const rule = (lead: string, opts: Opts, tail = "") => ({
  re: new RegExp(String.raw`(?<![\p{L}])((?:${lead})${tail})([ \t]+)${REST}`, "giu"),
  opts,
});

const RELATIONS_CA = String.raw`cap|jefe|responsable|encarregat|encarregada|supervisor|supervisora|company|companya|director|directora|gerent`;
const NAME_RULES = [
  // Self-introduction, strong leads: the name may be lowercase.
  rule(
    String.raw`em\s+dic|em\s+diuen|el\s+meu\s+nom\s+és|me\s+llamo|me\s+llaman|me\s+dicen|mi\s+nombre\s+es|my\s+name\s+is|my\s+name['’]s|(?:i\s+am|i['’]m)\s+called|call\s+me`,
    { min: 1, lowerFirst: true },
  ),
  // Weaker leads: only when a capitalised name follows.
  rule(String.raw`sóc|soc|soy|i\s+am|i['’]m`, { min: 1 }),
  // Titles.
  rule(
    String.raw`(?:el|la)\s+senyor(?:a)?|(?:el|la)\s+señor(?:a)?|sr\.?|sra\.?|srta\.?|mr\.?|mrs\.?|ms\.?|miss|mister|don|doña|dr\.?|dra\.?`,
    { min: 1 },
  ),
  // Relation to the writer: "el meu cap Joan", "mi jefe Pedro Ruiz", "my manager is Sam Lee".
  rule(
    String.raw`(?:el\s+meu|la\s+meva)\s+(?:${RELATIONS_CA})|mi\s+(?:jefe|jefa|responsable|encargado|encargada|supervisor|supervisora|compañero|compañera|director|directora|gerente)|my\s+(?:manager|boss|supervisor|colleague|co-?worker|team\s+lead(?:er)?|director)`,
    { min: 1 },
    String.raw`[,:]?(?:[ \t]+(?:és|es|is|se\s+llama|es\s+diu|called|named|anomenat|llamado))?`,
  ),
  // Talking or working with someone.
  rule(
    String.raw`(?:parl|habl|talk|spok|speak|treball|trabaj|work|report)\w*[ \t]+(?:amb|con|with|to|for)`,
    { min: 1 },
  ),
  // Bare "with Firstname Surname".
  rule(String.raw`amb|con|with`, { min: 2 }),
];

function digitsIn(s: string): number {
  return s.replace(/\D/g, "").length;
}

export function redactPii(input: string): string {
  let out = input;
  // Emails.
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correu]");
  // IBAN-like account numbers.
  out = out.replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/g, "[compte]");
  // DNI (8 digits + letter) and NIE (X/Y/Z + 7 digits + letter), with optional separators.
  out = out.replace(/\b\d{8}[ -]?[A-Z]\b/gi, "[DNI]");
  out = out.replace(/\b[XYZ][ -]?\d{7}[ -]?[A-Z]\b/gi, "[DNI]");
  // Employee-number-like IDs: labelled ("empleat 48213", "ID: E-48213") or a letter prefix + digits.
  out = out.replace(
    /\b(?:id|empleat|empleada|empleado|employee|emp|n[úu]m(?:ero)?|n[º°]|matr[íi]cula|badge|treballador|trabajador)\.?[ \t]*[:#-]?[ \t]*[A-Z]{0,4}-?\d{3,10}\b/gi,
    "[id]",
  );
  out = out.replace(/\b(?:[A-Z]{1,4}-?\d{5,8}|[A-Z]{2,4}-\d{3,8})\b/g, "[id]");
  // Phones: 9 to 15 digits (Spanish 9-digit, with or without +34), space, dot or dash separators.
  out = out.replace(/(?<![\w])(?:\+|00)?\d(?:[\d \t.-]{6,}\d)(?![\w])/g, (m) => {
    const n = digitsIn(m);
    return n >= 9 && n <= 15 ? "[telèfon]" : m;
  });
  // Names.
  for (const { re, opts } of NAME_RULES) {
    out = out.replace(re, (_m, lead: string, gap: string, rest: string) => redactNameRun(lead, gap, rest, opts));
  }
  return out;
}
