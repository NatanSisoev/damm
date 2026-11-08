/** Clean a join code from a URL segment, query string or form: safe-decode, trim, upper-case, NFC. */
export function normalizeJoinCode(raw: string | undefined | null): string {
  let s = raw ?? "";
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep the raw value */
  }
  return s.trim().toUpperCase().normalize("NFC");
}
