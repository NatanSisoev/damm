// Display helpers shared by the HR and manager screens. Pure, no DB access.

/** One decimal with a decimal comma: 3.14 to "3,1". */
export const num1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Signed one-decimal difference with a real minus sign: "+0,3" / "−0,3". */
export const signed1 = (v: number) => `${v >= 0 ? "+" : "−"}${num1(Math.abs(v))}`;

const SHIFT: Record<string, string> = { mati: "matí" };

/** Shift name as shown to people. The DB value `mati` stays as is (copy guide, rule 10). */
export const tornLabel = (torn: string) => SHIFT[torn] ?? torn;

/** Fixes shift names inside text written by the engine. */
export const fixShifts = (text: string) => text.replace(/\bmati\b/g, "matí");
