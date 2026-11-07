// Employee-side account repository. Touches `compte` and `push_subscripcio` only.
// No email, phone or name: an account is an opaque id, a username and salted hashes.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { getDb } from "./connection";

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

// In-memory attempt limiter per username (prototype: single process).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { n: number; first: number }>();

function blocked(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.n >= MAX_ATTEMPTS;
}
function fail(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { n: 1, first: Date.now() });
  else a.n += 1;
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
): Promise<{ ok: true; compteId: string } | { ok: false; error: LoginError }> {
  const username = normalizeUsername(usernameRaw);
  if (blocked(username)) return { ok: false, error: "massa_intents" };
  const row = findByUsername(username);
  if (!row) {
    await dummyWork(password);
    fail(username);
    return { ok: false, error: "credencials" };
  }
  if (!(await matches(password, row.salt, row.password_hash))) {
    fail(username);
    return { ok: false, error: "credencials" };
  }
  attempts.delete(username);
  return { ok: true, compteId: row.id };
}

// Uses the recovery code once: sets the new password and replaces the code with a fresh one.
export async function recoverAccount(input: {
  username: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ ok: true; compteId: string; recoveryCode: string } | { ok: false; error: RecoverError }> {
  const username = normalizeUsername(input.username);
  if (blocked(username)) return { ok: false, error: "massa_intents" };
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "password_curta" };

  const row = findByUsername(username);
  const code = normalizeRecoveryCode(input.recoveryCode);
  if (!row || !row.recovery_hash) {
    await dummyWork(code);
    fail(username);
    return { ok: false, error: "credencials" };
  }
  if (!(await matches(code, row.salt, row.recovery_hash))) {
    fail(username);
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
    fail(username);
    return { ok: false, error: "credencials" };
  }
  attempts.delete(username);
  return { ok: true, compteId: row.id, recoveryCode };
}

export function compteExists(compteId: string): boolean {
  return getDb().prepare("SELECT 1 FROM compte WHERE id = ?").get(compteId) !== undefined;
}

export function deletePushSubscription(compteId: string): void {
  getDb().prepare("DELETE FROM push_subscripcio WHERE compte_id = ?").run(compteId);
}
