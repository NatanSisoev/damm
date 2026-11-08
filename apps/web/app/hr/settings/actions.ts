"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Lang } from "@damm/shared";
import { deleteHrPushSubscription, saveHrPushSubscription } from "@damm/db/hr";
import { sendHrTestPush } from "@/lib/hr-push";
import { getLang } from "@/lib/lang";

type SubJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

function parse(sub: SubJson, lang: Lang) {
  const { endpoint, keys } = sub ?? {};
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth, lang };
}

const currentLang = (): Promise<Lang> => getLang();

/** Stores this HR browser's push subscription for alarm notifications (endpoint only, no person). */
export async function saveHrPushAction(sub: SubJson): Promise<{ ok: boolean }> {
  const s = parse(sub, await currentLang());
  if (!s) return { ok: false };
  saveHrPushSubscription(s);
  return { ok: true };
}

export async function deleteHrPushAction(endpoint: string): Promise<{ ok: boolean }> {
  if (endpoint) deleteHrPushSubscription(endpoint);
  return { ok: true };
}

/** Sends a test notification to this browser (also refreshes its stored language). */
export async function testHrPushAction(sub: SubJson): Promise<{ ok: boolean }> {
  const s = parse(sub, await currentLang());
  if (!s) return { ok: false };
  saveHrPushSubscription(s);
  return { ok: await sendHrTestPush(s) };
}

/** Demo reset (N-17): refused unless DEMO_RESET_ENABLED=1. Redirects back with the outcome. */
export async function resetDemoAction() {
  const { resetDemoNow } = await import("@/lib/demo-reset");
  const result = resetDemoNow();
  revalidatePath("/hr", "layout");
  redirect(`/hr/settings?reset=${result}`);
}
