// Employee-side repository: accounts (`compte`, `push_subscripcio`) and the answer flow
// (reads `pregunta`, reads/writes the caller's own `resposta`).
// No email, phone or name: an account is an opaque id, a username and salted hashes.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { DEFAULT_LANG, isLang, parseTranslations, type Lang, type Translations } from "@damm/shared";
import { getDb } from "./connection";
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
  lang?: Lang;
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
      `INSERT INTO compte (id, collectiu_id, username, password_hash, salt, recovery_hash, lang)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(compteId, jc.collectiu_id, username, passwordHash, salt, recoveryHash, isLang(input.lang) ? input.lang : DEFAULT_LANG);
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

export type ChangePasswordError = "credencials" | "password_curta" | "massa_intents";
export type AccountActionError = "credencials" | "massa_intents";

async function checkCurrentPassword(
  compteId: string,
  password: string,
  ip: string | undefined,
): Promise<{ ok: true; row: CompteRow & { username: string } } | { ok: false; error: AccountActionError }> {
  const row = getDb()
    .prepare("SELECT id, username, password_hash, salt, recovery_hash FROM compte WHERE id = ?")
    .get(compteId) as (CompteRow & { username: string }) | undefined;
  if (!row) return { ok: false, error: "credencials" };
  const key = row.username;
  if (blocked(key, ip)) return { ok: false, error: "massa_intents" };
  if (!(await matches(password, row.salt, row.password_hash))) {
    fail(key, ip);
    return { ok: false, error: "credencials" };
  }
  succeed(key, ip);
  return { ok: true, row };
}

// Changes the password after checking the current one. The salt is kept (it is shared with the
// recovery hash, so the recovery code stays valid); only the password hash changes.
export async function changePassword(input: {
  compteId: string;
  currentPassword: string;
  newPassword: string;
  clientIp?: string;
}): Promise<{ ok: true } | { ok: false; error: ChangePasswordError }> {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "password_curta" };
  const check = await checkCurrentPassword(input.compteId, input.currentPassword, input.clientIp);
  if (!check.ok) return check;
  const passwordHash = (await hashSecret(input.newPassword, check.row.salt)).toString("hex");
  getDb().prepare("UPDATE compte SET password_hash = ? WHERE id = ?").run(passwordHash, check.row.id);
  return { ok: true };
}

// Replaces the recovery code with a new one (the old one stops working). Needs the password.
// Returns the new code once; only its hash is stored.
export async function regenerateRecoveryCode(input: {
  compteId: string;
  currentPassword: string;
  clientIp?: string;
}): Promise<{ ok: true; recoveryCode: string } | { ok: false; error: AccountActionError }> {
  const check = await checkCurrentPassword(input.compteId, input.currentPassword, input.clientIp);
  if (!check.ok) return check;
  const recoveryCode = newRecoveryCode();
  const recoveryHash = (await hashSecret(normalizeRecoveryCode(recoveryCode), check.row.salt)).toString("hex");
  getDb().prepare("UPDATE compte SET recovery_hash = ? WHERE id = ?").run(recoveryHash, check.row.id);
  return { ok: true, recoveryCode };
}

// Deletes the account (and its push subscription, assignments and per-person state by cascade).
// Answers already given stay as anonymous data: `resposta.compte_id` has no cascade and the
// analytics view joins `compte`, so they are re-pointed to an anonymous tombstone row with the
// same collective / centre / shift / manager flag. The tombstone has no usable username
// or password and is excluded from the admin account counts (ids start with 'deleted:').
export async function deleteAccount(input: {
  compteId: string;
  currentPassword: string;
  clientIp?: string;
}): Promise<{ ok: true } | { ok: false; error: AccountActionError }> {
  const check = await checkCurrentPassword(input.compteId, input.currentPassword, input.clientIp);
  if (!check.ok) return check;
  const db = getDb();
  const tombId = `deleted:${randomUUID()}`;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, es_manager, username, password_hash, salt, recovery_hash)
       SELECT ?, collectiu_id, centre_tipus_id, torn_id, es_manager, ?, '', '', NULL FROM compte WHERE id = ?`,
    ).run(tombId, `~${tombId}`, input.compteId);
    db.prepare("UPDATE resposta SET compte_id = ? WHERE compte_id = ?").run(tombId, input.compteId);
    db.prepare("DELETE FROM push_subscripcio WHERE compte_id = ?").run(input.compteId);
    db.prepare("DELETE FROM compte WHERE id = ?").run(input.compteId);
  })();
  return { ok: true };
}

export function compteExists(compteId: string): boolean {
  return getDb().prepare("SELECT 1 FROM compte WHERE id = ?").get(compteId) !== undefined;
}

/** The account's chosen language (the only language data stored per person). */
export function getCompteLang(compteId: string): Lang {
  const r = getDb().prepare("SELECT lang FROM compte WHERE id = ?").get(compteId) as { lang: string } | undefined;
  return r && isLang(r.lang) ? r.lang : DEFAULT_LANG;
}

export function setCompteLang(compteId: string, lang: Lang): void {
  if (!isLang(lang)) return;
  getDb().prepare("UPDATE compte SET lang = ? WHERE id = ?").run(lang, compteId);
}

export interface QuestionTranslation {
  text: Translations | null;
  /** Per option index, in the same order as the question's options. */
  options: (Translations | null)[];
}

/**
 * Translations of the given questions, by id. The engine only returns Catalan/canonical text and
 * labels, so the app merges these by question id and option index. Missing = fall back to the text.
 */
export function getQuestionTranslations(ids: number[]): Map<number, QuestionTranslation> {
  const out = new Map<number, QuestionTranslation>();
  if (ids.length === 0) return out;
  const rows = getDb()
    .prepare(`SELECT id, text_i18n, options_json FROM pregunta WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as { id: number; text_i18n: string | null; options_json: string | null }[];
  for (const r of rows) {
    let options: (Translations | null)[] = [];
    if (r.options_json) {
      try {
        const arr = JSON.parse(r.options_json);
        if (Array.isArray(arr)) options = arr.map((o) => parseTranslations(o?.i18n));
      } catch {
        /* malformed options: no option translations */
      }
    }
    out.set(r.id, { text: parseTranslations(r.text_i18n), options });
  }
  return out;
}

export function deletePushSubscription(compteId: string): void {
  getDb().prepare("DELETE FROM push_subscripcio WHERE compte_id = ?").run(compteId);
}

// --- Answer flow -------------------------------------------------------------------------
// Question selection and answer validation live in @damm/engine (createEngine); the web routes
// inject `redactPii` below. Nothing here reads questions or stores answers any more.

// PII redaction lives in ./pii.ts (ca/es/en); re-exported for the web routes.
export { redactPii };

// --- Web push ------------------------------------------------------------------------------
// The subscription lives in its own table keyed by compte_id, is deleted on logout and is never
// joined to analytics. Only the push sender (apps/web/lib/push.ts) reads targets, and it reports
// aggregate counts only.

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A push target plus the subscriber's language (never the account id). */
export interface PushTargetLang extends PushTarget {
  lang: Lang;
}

/** Stores (or replaces) this account's subscription: one device per account. */
export function savePushSubscription(compteId: string, sub: PushTarget): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscripcio (compte_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(compte_id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh,
       auth = excluded.auth, creat = datetime('now')`,
    )
    .run(compteId, sub.endpoint, sub.p256dh, sub.auth);
}

export function hasPushSubscription(compteId: string): boolean {
  return getDb().prepare("SELECT 1 FROM push_subscripcio WHERE compte_id = ?").get(compteId) !== undefined;
}

/**
 * Subscriptions of every account in the need's collective (all collectives when the need has
 * none). Returns endpoints and keys only, never the account id.
 */
export function listPushTargetsForNecessitat(necessitatId: number): PushTargetLang[] {
  const db = getDb();
  const n = db.prepare("SELECT collectiu_id AS c FROM necessitat WHERE id = ?").get(necessitatId) as { c: number | null } | undefined;
  if (!n) return [];
  return db
    .prepare(
      `SELECT s.endpoint, s.p256dh, s.auth, c.lang FROM push_subscripcio s JOIN compte c ON c.id = s.compte_id
       WHERE ? IS NULL OR c.collectiu_id = ?`,
    )
    .all(n.c, n.c) as PushTargetLang[];
}

/** The push service said the subscription is gone (404/410). */
export function deletePushSubscriptionByEndpoint(endpoint: string): void {
  getDb().prepare("DELETE FROM push_subscripcio WHERE endpoint = ?").run(endpoint);
}

/** Daily question limit: engine config `questions_per_day`, 3 when unset (same default as the engine). */
function questionsPerDay(db: ReturnType<typeof getDb>): number {
  const row = db.prepare("SELECT value FROM engine_config WHERE key = 'questions_per_day'").get() as { value: string } | undefined;
  const v = row ? Number(JSON.parse(row.value)) : NaN;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 3;
}

/**
 * Puts the unanswered questions of published HR needs for this account's collective into an
 * existing day's batch, so a need published after the batch was built shows up straight away
 * (on login or from the push). The batch never goes past the daily limit: need questions take
 * the free slots first, then replace unanswered `monitor` questions (needs have top priority).
 * Whatever does not fit stays in the pool for the next day's batch. Never adds a question the
 * account already answered or that is already in that day's batch. Returns how many rows changed.
 * Call it after the engine has built the day (it only changes it, it never creates the batch).
 */
export function addPublishedNeedsToDay(compteId: string, day: string): number {
  const db = getDb();
  return db.transaction(() => {
    const limit = questionsPerDay(db);
    const rows = db
      .prepare("SELECT slot, reason, answered_at FROM assignment WHERE compte_id = ? AND day = ?")
      .all(compteId, day) as { slot: number; reason: string; answered_at: string | null }[];
    if (rows.length === 0) return 0;
    const used = new Set(rows.map((r) => r.slot));
    const slots: number[] = [];
    for (let i = 0; i < limit; i++) if (!used.has(i)) slots.push(i);
    const replaceable = rows.filter((r) => r.reason === "monitor" && !r.answered_at).map((r) => r.slot).sort((a, b) => b - a);
    const room = slots.length + replaceable.length;
    if (room === 0) return 0;
    const missing = db
      .prepare(
        `SELECT p.id FROM pregunta p
           JOIN necessitat n ON n.id = p.necessitat_id
           JOIN compte c ON c.id = ?
          WHERE p.estat = 'aprovada' AND p.is_followup = 0 AND n.estat = 'publicada'
            AND (n.collectiu_id IS NULL OR n.collectiu_id = c.collectiu_id)
            AND (p.collectiu_id IS NULL OR p.collectiu_id = c.collectiu_id)
            AND NOT EXISTS (SELECT 1 FROM resposta r WHERE r.compte_id = c.id AND r.pregunta_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.compte_id = c.id AND a.day = ? AND a.pregunta_id = p.id)
          ORDER BY p.prioritat DESC, p.id
          LIMIT ?`,
      )
      .all(compteId, day, room) as { id: number }[];
    const del = db.prepare("DELETE FROM assignment WHERE compte_id = ? AND day = ? AND slot = ?");
    const insert = db.prepare(
      "INSERT OR IGNORE INTO assignment (compte_id, pregunta_id, day, slot, reason) VALUES (?, ?, ?, ?, 'need')",
    );
    const targets = [...slots, ...replaceable];
    let changed = 0;
    missing.forEach((q, i) => {
      const slot = targets[i]!;
      if (i >= slots.length) del.run(compteId, day, slot);
      changed += insert.run(compteId, q.id, day, slot).changes;
    });
    return changed;
  })();
}
