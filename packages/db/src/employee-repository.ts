// Employee-side repository: accounts (`compte`, `push_subscripcio`) and the answer flow
// (reads `pregunta`, reads/writes the caller's own `resposta`).
// No email, phone or name: an account is an opaque id, a username and salted hashes.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { Canal, PreguntaTipus, RankingOption, ScoredOption } from "@damm/shared";
import { getDb } from "./connection";
import { madridDay, type MadridDay } from "./madrid-day";
import { redactPii } from "./pii";

const KEYLEN = 64;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 8;

export type RegisterError =
  | "codi_invalid"
  | "username_invalid"
  | "username_ocupat"
  | "password_curta";
export type RecoverError = "credencials" | "password_curta" | "massa_intents";
export type LoginError = "credencials" | "massa_intents";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function hashSecret(secret: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, Buffer.from(salt, "hex"), KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function matches(secret: string, salt: string, expectedHex: string): Promise<boolean> {
  const got = await hashSecret(secret, salt);
  const want = Buffer.from(expectedHex, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

// Crockford-like alphabet without look-alikes (no 0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  let raw = "";
  for (const b of bytes) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return raw.match(/.{4}/g)!.join("-");
}

function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// In-memory attempt limiter (prototype: single process). Failures are counted per username AND client
// IP, so a stranger who spams a known username only locks out their own IP, not the real user on
// another one. A separate per-IP cap throttles one client trying many usernames. The same limiter
// serves login and recovery; the answer is identical for existing and unknown usernames.
const MAX_ATTEMPTS = 5; // per (username, ip)
const MAX_ATTEMPTS_PER_IP = 20; // per ip, across usernames
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;
const attempts = new Map<string, { n: number; first: number }>();

function limiterKeys(username: string, ip: string | undefined): [string, string] {
  const addr = (ip ?? "").trim().slice(0, 64) || "unknown";
  return [`u:${username}|${addr}`, `ip:${addr}`];
}
function over(key: string, max: number): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.n >= max;
}
function bump(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { n: 1, first: Date.now() });
  else a.n += 1;
}
function blocked(username: string, ip: string | undefined): boolean {
  const [k, kip] = limiterKeys(username, ip);
  return over(k, MAX_ATTEMPTS) || over(kip, MAX_ATTEMPTS_PER_IP);
}
function fail(username: string, ip: string | undefined) {
  if (attempts.size > MAX_TRACKED) {
    const now = Date.now();
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k);
    if (attempts.size > MAX_TRACKED) attempts.clear(); // under flood, fail open on memory rather than grow
  }
  const [k, kip] = limiterKeys(username, ip);
  bump(k);
  bump(kip);
}
// Success clears only this (username, ip) counter; the per-IP counter keeps counting.
function succeed(username: string, ip: string | undefined) {
  attempts.delete(limiterKeys(username, ip)[0]);
}

interface CompteRow {
  id: string;
  password_hash: string;
  salt: string;
  recovery_hash: string | null;
}

function findByUsername(username: string): CompteRow | undefined {
  return getDb()
    .prepare("SELECT id, password_hash, salt, recovery_hash FROM compte WHERE username = ?")
    .get(username) as CompteRow | undefined;
}

// Burns comparable time when the username does not exist, so timing does not reveal it.
const DUMMY_SALT = randomBytes(16).toString("hex");
async function dummyWork(secret: string) {
  await hashSecret(secret, DUMMY_SALT);
}

export async function registerAccount(input: {
  codi: string;
  username: string;
  password: string;
}): Promise<{ ok: true; compteId: string; recoveryCode: string } | { ok: false; error: RegisterError }> {
  const db = getDb();
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) return { ok: false, error: "username_invalid" };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "password_curta" };

  const jc = db
    .prepare("SELECT collectiu_id FROM joincode WHERE codi = ? AND actiu = 1")
    .get(input.codi.trim().toUpperCase()) as { collectiu_id: number } | undefined;
  if (!jc) return { ok: false, error: "codi_invalid" };

  const salt = randomBytes(16).toString("hex");
  const recoveryCode = newRecoveryCode();
  const passwordHash = (await hashSecret(input.password, salt)).toString("hex");
  const recoveryHash = (await hashSecret(normalizeRecoveryCode(recoveryCode), salt)).toString("hex");
  const compteId = randomUUID();

  try {
    db.prepare(
      `INSERT INTO compte (id, collectiu_id, username, password_hash, salt, recovery_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(compteId, jc.collectiu_id, username, passwordHash, salt, recoveryHash);
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return { ok: false, error: "username_ocupat" };
    throw e;
  }
  return { ok: true, compteId, recoveryCode };
}

export async function verifyLogin(
  usernameRaw: string,
  password: string,
  clientIp?: string,
): Promise<{ ok: true; compteId: string } | { ok: false; error: LoginError }> {
  const username = normalizeUsername(usernameRaw);
  const ip = clientIp;
  if (blocked(username, ip)) return { ok: false, error: "massa_intents" };
  const row = findByUsername(username);
  if (!row) {
    await dummyWork(password);
    fail(username, ip);
    return { ok: false, error: "credencials" };
  }
  if (!(await matches(password, row.salt, row.password_hash))) {
    fail(username, ip);
    return { ok: false, error: "credencials" };
  }
  succeed(username, ip);
  return { ok: true, compteId: row.id };
}

// Uses the recovery code once: sets the new password and replaces the code with a fresh one.
export async function recoverAccount(input: {
  username: string;
  recoveryCode: string;
  newPassword: string;
  clientIp?: string;
}): Promise<{ ok: true; compteId: string; recoveryCode: string } | { ok: false; error: RecoverError }> {
  const username = normalizeUsername(input.username);
  const ip = input.clientIp;
  if (blocked(username, ip)) return { ok: false, error: "massa_intents" };
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "password_curta" };

  const row = findByUsername(username);
  const code = normalizeRecoveryCode(input.recoveryCode);
  if (!row || !row.recovery_hash) {
    await dummyWork(code);
    fail(username, ip);
    return { ok: false, error: "credencials" };
  }
  if (!(await matches(code, row.salt, row.recovery_hash))) {
    fail(username, ip);
    return { ok: false, error: "credencials" };
  }

  const salt = randomBytes(16).toString("hex");
  const recoveryCode = newRecoveryCode();
  const passwordHash = (await hashSecret(input.newPassword, salt)).toString("hex");
  const recoveryHash = (await hashSecret(normalizeRecoveryCode(recoveryCode), salt)).toString("hex");
  // Compare-and-set on the old recovery hash so a code cannot be used twice concurrently.
  const res = getDb()
    .prepare(
      `UPDATE compte SET password_hash = ?, salt = ?, recovery_hash = ?
       WHERE id = ? AND recovery_hash = ?`,
    )
    .run(passwordHash, salt, recoveryHash, row.id, row.recovery_hash);
  if (res.changes !== 1) {
    fail(username, ip);
    return { ok: false, error: "credencials" };
  }
  succeed(username, ip);
  return { ok: true, compteId: row.id, recoveryCode };
}

export function compteExists(compteId: string): boolean {
  return getDb().prepare("SELECT 1 FROM compte WHERE id = ?").get(compteId) !== undefined;
}

export function deletePushSubscription(compteId: string): void {
  getDb().prepare("DELETE FROM push_subscripcio WHERE compte_id = ?").run(compteId);
}

// --- Answer flow -------------------------------------------------------------------------
// Employee side only: reads `pregunta` and the caller's own `resposta` rows, writes `resposta`.
// Nothing here returns another account's data or any aggregate.

export const DAILY_QUESTION_LIMIT = 2;

type QuestionOptions = ScoredOption[] | RankingOption[] | null;
export type PoolQuestion = { id: number; dominiId: number; text: string; tipus: PreguntaTipus; options: QuestionOptions };

function parseOptions(raw: string | null): QuestionOptions {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.length ? (v as QuestionOptions) : null;
  } catch {
    return null;
  }
}

export type AnswerInput = {
  preguntaId: number;
  valorNum?: number | null;
  comentari?: string | null;
  valueJson?: number[] | null; // ranking: option indices, best first
  answerMs?: number | null;
};
export type SaveError = "pregunta_invalida" | "valor_invalid" | "comentari_obligatori" | "ja_respost" | "redaccio_fallida";

/** "Today" in Europe/Madrid, with the UTC bounds used to match `resposta.data` (stored in UTC). */
function serverDate(now = new Date()): MadridDay {
  return madridDay(now);
}

function collectiuOf(compteId: string): number | undefined {
  const row = getDb().prepare("SELECT collectiu_id FROM compte WHERE id = ?").get(compteId) as
    | { collectiu_id: number }
    | undefined;
  return row?.collectiu_id;
}

function answeredToday(compteId: string, day: MadridDay): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM resposta WHERE compte_id = ? AND data >= ? AND data < ?")
    .get(compteId, day.startUtc, day.endUtc) as { n: number };
  return row.n;
}

/**
 * Stub selection until packages/engine lands: approved questions visible to the account's
 * collective, highest `prioritat` first, none answered today, capped so the account never gets
 * more than DAILY_QUESTION_LIMIT questions per day in total.
 */
export function nextQuestionsForToday(compteId: string): PoolQuestion[] {
  const collectiuId = collectiuOf(compteId);
  if (collectiuId === undefined) return [];
  const day = serverDate();
  const remaining = DAILY_QUESTION_LIMIT - answeredToday(compteId, day);
  if (remaining <= 0) return [];
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.domini_id AS dominiId, p.text, p.tipus, p.options_json AS optionsJson
       FROM pregunta p
       WHERE p.estat = 'aprovada'
         AND (p.collectiu_id IS NULL OR p.collectiu_id = @collectiu)
         AND NOT EXISTS (
           SELECT 1 FROM resposta r
           WHERE r.compte_id = @compte AND r.pregunta_id = p.id AND r.data >= @from AND r.data < @to
         )
       ORDER BY p.prioritat DESC, p.id ASC
       LIMIT @limit`,
    )
    .all({ collectiu: collectiuId, compte: compteId, from: day.startUtc, to: day.endUtc, limit: remaining });
  return (rows as (Omit<PoolQuestion, "options"> & { optionsJson: string | null })[]).map(
    ({ optionsJson, ...q }) => ({ ...q, options: parseOptions(optionsJson) }),
  );
}

// PII redaction lives in ./pii.ts (ca/es/en); re-exported for existing importers.
export { redactPii };

/** Inclusive range of `valor_num` per type. pair/choice store the chosen option index. */
function valueRange(tipus: PreguntaTipus, optionCount: number): [number, number] | null {
  switch (tipus) {
    case "scale5":
      return [1, 5];
    case "scale10":
      return [0, 10];
    case "yes_no":
      return [0, 1];
    case "ranking":
      return [1, 5];
    case "pair":
    case "choice":
      return optionCount >= 2 ? [0, optionCount - 1] : null;
    case "open":
      return null;
  }
}

function validValue(tipus: PreguntaTipus, optionCount: number, v: number | null | undefined): number | null | "invalid" {
  if (tipus === "open") return v == null ? null : "invalid";
  if (v == null || !Number.isFinite(v)) return "invalid";
  const range = valueRange(tipus, optionCount);
  if (!range) return "invalid";
  return Number.isInteger(v) && v >= range[0] && v <= range[1] ? v : "invalid";
}

/** Ranking order: a permutation of the option indices, best first. Other types store nothing. */
function validOrder(tipus: PreguntaTipus, optionCount: number, order: number[] | null | undefined): string | null | "invalid" {
  if (order == null) return null;
  if (tipus !== "ranking" || order.length !== optionCount) return "invalid";
  const sorted = [...order].sort((a, b) => a - b);
  return sorted.every((x, i) => x === i) ? JSON.stringify(order) : "invalid";
}

/**
 * Validates every answer against its question and stores them in one transaction: either all
 * rows land or none. `periode` comes from the server date, never from the client.
 */
export function saveResponses(
  compteId: string,
  respostes: AnswerInput[],
  canal: Canal = "app",
): { ok: true } | { ok: false; error: SaveError; preguntaId?: number } {
  const db = getDb();
  const collectiuId = collectiuOf(compteId);
  if (collectiuId === undefined) return { ok: false, error: "pregunta_invalida" };
  const { periode, startUtc, endUtc } = serverDate();

  const getQ = db.prepare(
    `SELECT tipus, options_json FROM pregunta
     WHERE id = ? AND estat = 'aprovada' AND (collectiu_id IS NULL OR collectiu_id = ?)`,
  );
  const already = db.prepare(
    "SELECT 1 FROM resposta WHERE compte_id = ? AND pregunta_id = ? AND data >= ? AND data < ?",
  );
  const insert = db.prepare(
    `INSERT INTO resposta (compte_id, pregunta_id, valor_num, value_json, comentari, canal, periode, answer_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(
    (): { ok: true } | { ok: false; error: SaveError; preguntaId?: number } => {
      const seen = new Set<number>();
      for (const a of respostes) {
        if (seen.has(a.preguntaId)) return { ok: false, error: "ja_respost", preguntaId: a.preguntaId };
        seen.add(a.preguntaId);
        const q = getQ.get(a.preguntaId, collectiuId) as { tipus: PreguntaTipus; options_json: string | null } | undefined;
        if (!q) return { ok: false, error: "pregunta_invalida", preguntaId: a.preguntaId };
        if (already.get(compteId, a.preguntaId, startUtc, endUtc)) {
          return { ok: false, error: "ja_respost", preguntaId: a.preguntaId };
        }
        const optionCount = parseOptions(q.options_json)?.length ?? 0;
        const valor = validValue(q.tipus, optionCount, a.valorNum);
        if (valor === "invalid") return { ok: false, error: "valor_invalid", preguntaId: a.preguntaId };
        const order = validOrder(q.tipus, optionCount, a.valueJson);
        if (order === "invalid") return { ok: false, error: "valor_invalid", preguntaId: a.preguntaId };
        const answerMs = a.answerMs != null && Number.isInteger(a.answerMs) && a.answerMs >= 0 ? a.answerMs : null;

        let comentari: string | null = null;
        if (q.tipus === "open") {
          const raw = (a.comentari ?? "").trim();
          if (!raw) return { ok: false, error: "comentari_obligatori", preguntaId: a.preguntaId };
          try {
            comentari = redactPii(raw);
          } catch {
            return { ok: false, error: "redaccio_fallida", preguntaId: a.preguntaId };
          }
        }
        insert.run(compteId, a.preguntaId, valor, order, comentari, canal, periode, answerMs);
      }
      return { ok: true };
    },
  );
  return run();
}
