#!/usr/bin/env node
// Anonymity boundary guard (see AGENTS.md, "Anonymity boundary"). Plain Node, no dependencies.
// Run: pnpm check:anonymity. Exits 1 with a readable list of violations.
//
//  (a) The HR data layer (packages/db/src/hr.ts and every file it reaches through relative
//      imports/exports, i.e. hr-repository.ts) must not mention raw response/account data.
//  (b) Nothing under apps/web/app/hr/** may import the DB root, other repositories or a driver.
//  (c) The analytics view v_resposta_analitica must not expose compte_id in its output columns.
//
// The ESLint rule in apps/web/eslint.config.mjs enforces (b) at edit time; this script is the
// CI/demo-friendly second line and also covers (a) and (c), which lint cannot see.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.relative(root, p);
const violations = [];
const fail = (where, msg) => violations.push(`${where}\n    ${msg}`);

// ---- helpers --------------------------------------------------------------------------------

/** Replace comments with spaces (keeping line numbers). Strings and template literals are kept
 *  because the SQL lives in them. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c; out += c; i++;
    } else if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else {
      out += c; i++;
    }
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Range of a top-level `function <name>` in comment-stripped source: from its keyword to the
 *  closing brace at column 0 (the repo's formatting). Avoids brace-matching the return type. */
function functionRange(code, name) {
  const m = new RegExp(`function\\s+${name}\\b`).exec(code);
  if (!m) return null;
  const end = code.indexOf("\n}", m.index);
  return end === -1 ? null : [m.index, end + 2];
}

function relativeSpecifiers(code) {
  return [...code.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g)].map((m) => m[1]);
}

function resolveTs(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

// ---- (a) HR data layer ----------------------------------------------------------------------

const hrEntry = path.join(root, "packages/db/src/hr.ts");
const hrFiles = new Set();
(function collect(file) {
  if (hrFiles.has(file)) return;
  hrFiles.add(file);
  const code = stripComments(fs.readFileSync(file, "utf8"));
  for (const spec of relativeSpecifiers(code)) {
    const target = resolveTs(file, spec);
    if (target) collect(target);
  }
})(hrEntry);

// Identifiers that must never appear in HR-reachable code. `resposta` is matched as a whole word,
// so the sanctioned view `v_resposta_analitica` does not match it.
const FORBIDDEN = [
  "resposta", "resposta_seed", "compte_id", "push_subscripcio",
  "password_hash", "salt", "recovery_hash", "username",
  // Engine per-account tables (C1): only the engine and its job may read them.
  "assignment", "person_domain_state",
];
// `compte` (the accounts table) is forbidden too, with ONE explicit whitelist:
// accountCounts() in hr-repository.ts may count rows of `compte` grouped by collective
// (the admin view: "account counts per collective only, never identities").
const COMPTE_WHITELIST = { file: "packages/db/src/hr-repository.ts", fn: "accountCounts" };

for (const file of hrFiles) {
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const skip = rel(file) === COMPTE_WHITELIST.file ? functionRange(code, COMPTE_WHITELIST.fn) : null;
  const check = (word, allowIn) => {
    for (const m of code.matchAll(new RegExp(`\\b${word}\\b`, "gi"))) {
      if (allowIn && m.index >= allowIn[0] && m.index < allowIn[1]) continue;
      fail(`${rel(file)}:${lineOf(code, m.index)}`, `HR data layer references "${m[0]}" (raw response/account data). HR code may only read aggregates and v_resposta_analitica.`);
    }
  };
  for (const w of FORBIDDEN) check(w, null);
  check("compte", skip);
}

// ---- (b) HR app code imports ----------------------------------------------------------------

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [p] : [];
  });
}

function forbiddenImport(spec) {
  if (spec === "@damm/db") return "the @damm/db root exposes getDb and raw tables";
  if (spec.startsWith("@damm/db/") && spec !== "@damm/db/hr") return "only @damm/db/hr is allowed (join/raw repositories are employee-side)";
  if (spec === "@damm/engine" || (spec.startsWith("@damm/engine/") && spec !== "@damm/engine/hr")) return "only @damm/engine/hr is allowed (the engine root and job read per-account state)";
  if (/packages\/engine/.test(spec)) return "HR code must not reach into engine internals";
  if (["better-sqlite3", "sqlite3", "node:sqlite"].includes(spec)) return "HR code must not open the database directly";
  if (/packages\/db|join-repository|response-repository|resposta-repository|compte-repository|account-repository|\/connection$/.test(spec)) return "HR code must not reach into db internals or raw repositories";
  return null;
}

for (const file of walk(path.join(root, "apps/web/app/hr"))) {
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const specRe = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const m of code.matchAll(specRe)) {
    const why = forbiddenImport(m[1]);
    if (why) fail(`${rel(file)}:${lineOf(code, m.index)}`, `forbidden import "${m[1]}": ${why}.`);
  }
  for (const m of code.matchAll(/\bgetDb\b/g)) {
    fail(`${rel(file)}:${lineOf(code, m.index)}`, `HR code references getDb: it must not touch the database handle.`);
  }
}

// ---- (c) analytics view ---------------------------------------------------------------------

const schemaPath = path.join(root, "packages/db/schema.sql");
const schema = stripSqlComments(fs.readFileSync(schemaPath, "utf8"));
function stripSqlComments(sql) { return sql.replace(/--[^\n]*/g, (m) => " ".repeat(m.length)); }
const view = /CREATE\s+VIEW\s+v_resposta_analitica\s+AS\s+SELECT([\s\S]*?)\bFROM\b/i.exec(schema);
if (!view) {
  fail(rel(schemaPath), "view v_resposta_analitica not found.");
} else {
  // Only the output columns matter: the JOIN condition `c.id = r.compte_id` is how the view maps
  // answers to a collective, and is fine. Exposing compte_id (or a bare `*`) is not.
  const cols = view[1];
  const at = view.index + view[0].indexOf(cols);
  if (/\bcompte_id\b/i.test(cols)) fail(`${rel(schemaPath)}:${lineOf(schema, at)}`, "v_resposta_analitica exposes compte_id in its SELECT list.");
  if (/(^|[\s,.])\*/.test(cols)) fail(`${rel(schemaPath)}:${lineOf(schema, at)}`, "v_resposta_analitica uses SELECT * / alias.* which could leak compte_id.");
}

// ---- result ---------------------------------------------------------------------------------

if (violations.length) {
  console.error(`\nAnonymity boundary violated (${violations.length}):\n`);
  for (const v of violations) console.error(`  ✗ ${v}\n`);
  console.error("See AGENTS.md, section \"Anonymity boundary\".");
  process.exit(1);
}
console.log(`Anonymity check passed: ${hrFiles.size} HR data file(s), HR app imports and v_resposta_analitica are clean.`);
