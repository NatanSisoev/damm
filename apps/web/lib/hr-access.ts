// Demo access gate for /hr/* and /manager/*. The code comes from HR_ACCESS_CODE (.env).
// Empty code: the gate is open in development only. In production it fails closed (nobody gets in, /hr-login says
// "not configured"). The cookie holds a SHA-256 of the code, never the code itself. This is a prototype gate, not real auth.

export const HR_COOKIE = "hr_access";

export async function accessToken(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hr-access:${code}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const gateEnabled = (): boolean => !!process.env.HR_ACCESS_CODE;

/** Production without a configured code: deny everything instead of opening the HR side to the world. */
export const gateMisconfigured = (): boolean => !process.env.HR_ACCESS_CODE && process.env.NODE_ENV === "production";
