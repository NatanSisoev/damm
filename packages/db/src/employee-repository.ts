// Employee-side repository: accounts (`compte`, `push_subscripcio`) and the answer flow
// (reads `pregunta`, reads/writes the caller's own `resposta`).
// No email, phone or name: an account is an opaque id, a username and salted hashes.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { Canal, PreguntaTipus } from "@damm/shared";
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

// --- Answer flow -------------------------------------------------------------------------
// Employee side only: reads `pregunta` and the caller's own `resposta` rows, writes `resposta`.
// Nothing here returns another account's data or any aggregate.

export const DAILY_QUESTION_LIMIT = 2;

export type PoolQuestion = { id: number; dominiId: number; text: string; tipus: PreguntaTipus };

export type AnswerInput = { preguntaId: number; valorNum?: number | null; comentari?: string | null };
export type SaveError = "pregunta_invalida" | "valor_invalid" | "comentari_obligatori" | "ja_respost" | "redaccio_fallida";

/** `YYYY-MM-DD` and `YYYY-MM` from the server clock (UTC, same clock as SQLite's datetime('now')). */
function serverDate(now = new Date()): { dia: string; periode: string } {
  const iso = now.toISOString();
  return { dia: iso.slice(0, 10), periode: iso.slice(0, 7) };
}

function collectiuOf(compteId: string): number | undefined {
  const row = getDb().prepare("SELECT collectiu_id FROM compte WHERE id = ?").get(compteId) as
    | { collectiu_id: number }
    | undefined;
  return row?.collectiu_id;
}

function answeredToday(compteId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM resposta WHERE compte_id = ? AND date(data) = ?")
    .get(compteId, serverDate().dia) as { n: number };
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
  const remaining = DAILY_QUESTION_LIMIT - answeredToday(compteId);
  if (remaining <= 0) return [];
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.domini_id AS dominiId, p.text, p.tipus
       FROM pregunta p
       WHERE p.estat = 'aprovada'
         AND (p.collectiu_id IS NULL OR p.collectiu_id = @collectiu)
         AND NOT EXISTS (
           SELECT 1 FROM resposta r
           WHERE r.compte_id = @compte AND r.pregunta_id = p.id AND date(r.data) = @dia
         )
       ORDER BY p.prioritat DESC, p.id ASC
       LIMIT @limit`,
    )
    .all({ collectiu: collectiuId, compte: compteId, dia: serverDate().dia, limit: remaining });
  return rows as PoolQuestion[];
}

// --- PII redaction (regex, local, deterministic) ------------------------------------------
// Runs before anything is stored. Best-effort: it catches the common shapes below, it is not a
// guarantee. The human-facing note in the UI still tells people not to include personal data.

const NAME_WORD = String.raw`\p{Lu}[\p{L}'’-]*`;
const EM_DIC_RE = new RegExp(
  String.raw`\b([Ee]m\s+dic|[Ee]m\s+diuen|[Ee]l\s+meu\s+nom\s+és)\s+(?:(?:en|na|el|la)\s+)?(\p{L}[\p{L}'’-]*)((?:\s+(?:de\s+|del\s+|de\s+la\s+|i\s+)?${NAME_WORD}){0,2})`,
  "gu",
);
const NOT_A_NAME = new Set(["que", "això", "així", "per", "a", "de", "com", "quan", "si", "no", "molt"]);

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
  // Phones: 9 to 15 digits, optionally with +/00 prefix and space, dot or dash separators.
  out = out.replace(/(?<![\w])(?:\+|00)?\d(?:[\d \t.-]{6,}\d)(?![\w])/g, (m) => {
    const n = digitsIn(m);
    return n >= 9 && n <= 15 ? "[telèfon]" : m;
  });
  // Names introduced by "em dic ...".
  out = out.replace(EM_DIC_RE, (m, lead: string, first: string, rest: string) => {
    if (NOT_A_NAME.has(first.toLowerCase())) return m;
    return `${lead} [nom]`;
  });
  return out;
}

const SCALE_MAX: Record<PreguntaTipus, number | null> = {
  escala5: 5,
  escala10: 10,
  swipe: 1,
  ranking: 5,
  obert: null,
};

function validValue(tipus: PreguntaTipus, v: number | null | undefined): number | null | "invalid" {
  if (tipus === "obert") return v == null ? null : "invalid";
  if (v == null || !Number.isFinite(v)) return "invalid";
  const max = SCALE_MAX[tipus]!;
  const min = tipus === "swipe" ? 0 : 1;
  return Number.isInteger(v) && v >= min && v <= max ? v : "invalid";
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
  const { dia, periode } = serverDate();

  const getQ = db.prepare(
    `SELECT tipus FROM pregunta
     WHERE id = ? AND estat = 'aprovada' AND (collectiu_id IS NULL OR collectiu_id = ?)`,
  );
  const already = db.prepare(
    "SELECT 1 FROM resposta WHERE compte_id = ? AND pregunta_id = ? AND date(data) = ?",
  );
  const insert = db.prepare(
    `INSERT INTO resposta (compte_id, pregunta_id, valor_num, comentari, canal, periode)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(
    (): { ok: true } | { ok: false; error: SaveError; preguntaId?: number } => {
      const seen = new Set<number>();
      for (const a of respostes) {
        if (seen.has(a.preguntaId)) return { ok: false, error: "ja_respost", preguntaId: a.preguntaId };
        seen.add(a.preguntaId);
        const q = getQ.get(a.preguntaId, collectiuId) as { tipus: PreguntaTipus } | undefined;
        if (!q) return { ok: false, error: "pregunta_invalida", preguntaId: a.preguntaId };
        if (already.get(compteId, a.preguntaId, dia)) {
          return { ok: false, error: "ja_respost", preguntaId: a.preguntaId };
        }
        const valor = validValue(q.tipus, a.valorNum);
        if (valor === "invalid") return { ok: false, error: "valor_invalid", preguntaId: a.preguntaId };

        let comentari: string | null = null;
        if (q.tipus === "obert") {
          const raw = (a.comentari ?? "").trim();
          if (!raw) return { ok: false, error: "comentari_obligatori", preguntaId: a.preguntaId };
          try {
            comentari = redactPii(raw);
          } catch {
            return { ok: false, error: "redaccio_fallida", preguntaId: a.preguntaId };
          }
        }
        insert.run(compteId, a.preguntaId, valor, comentari, canal, periode);
      }
      return { ok: true };
    },
  );
  return run();
}
