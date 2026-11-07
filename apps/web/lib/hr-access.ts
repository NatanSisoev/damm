// Demo access gate for /hr/*. The code comes from HR_ACCESS_CODE (.env); empty means the gate is off (local dev).
// The cookie holds a SHA-256 of the code, never the code itself. This is a prototype gate, not real auth.

export const HR_COOKIE = "hr_access";

export async function accessToken(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hr-access:${code}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const gateEnabled = (): boolean => !!process.env.HR_ACCESS_CODE;
