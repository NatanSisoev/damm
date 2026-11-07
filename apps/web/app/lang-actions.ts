"use server";
// Language switch: sets the cookie; for a signed-in employee it also stores the choice on the account
// (question language and push language). Nothing else about the person is stored.
import { revalidatePath } from "next/cache";
import { isLang } from "@damm/shared";
import { setCompteLang } from "@damm/db/employee";
import { getCompteId } from "@/lib/session";
import { setLangCookie } from "@/lib/lang";

export async function setLanguageAction(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  await setLangCookie(lang);
  const compteId = await getCompteId();
  if (compteId) setCompteLang(compteId, lang);
  revalidatePath("/", "layout");
}
