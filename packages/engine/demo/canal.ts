// Demo-only: which channel an answer came through. Fàbriques and Logística staff mostly have no desk, so they scan the QR
// poster on the floor; Oficines almost always use the installed app. Deterministic per account and day.
import { createRng } from "../src/rng.ts";

/** Share of answers that arrive through the QR code, by collective id (1 Fàbriques, 2 Logística, 3 Comercial, 4 Oficines). */
const QR_SHARE: Record<number, number> = { 1: 0.38, 2: 0.32, 3: 0.1, 4: 0.05 };

export function demoChannel(seed: string | number, accountId: string, collectiuId: number, day: number): "app" | "mobil_qr" {
  return createRng(`canal|${seed}|${accountId}|${day}`)() < (QR_SHARE[collectiuId] ?? 0) ? "mobil_qr" : "app";
}
