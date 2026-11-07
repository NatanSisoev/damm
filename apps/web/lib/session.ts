// Signed, HttpOnly session cookie carrying the opaque compte id. The account is always
// taken from here, never from a request parameter.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { compteExists } from "@damm/db/employee";

const COOKIE = "damm_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

let warned = false;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  if (!warned) {
    warned = true;
    console.warn("[session] SESSION_SECRET not set: using an insecure dev fallback");
  }
  return "dev-only-insecure-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function createSession(compteId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${compteId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Returns the signed-in account id, or null. Use this in API routes and server pages. */
export async function getCompteId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  const given = Buffer.from(raw.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const [compteId, exp] = payload.split(".");
  if (!compteId || !(Number(exp) > Date.now() / 1000)) return null;
  return compteExists(compteId) ? compteId : null;
}
