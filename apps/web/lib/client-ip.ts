import { headers } from "next/headers";

/** Client IP for rate limiting. Uses the LAST x-forwarded-for entry (appended by the trusted proxy); the first one is client-controlled and would let anyone dodge the limiter by spoofing it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? h.get("x-real-ip") ?? "unknown";
}
