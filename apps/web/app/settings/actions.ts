"use server";

import { redirect } from "next/navigation";
import { deletePushSubscription } from "@damm/db/employee";
import { destroySession, getCompteId } from "@/lib/session";

export async function logoutAction() {
  const compteId = await getCompteId();
  if (compteId) deletePushSubscription(compteId);
  await destroySession();
  redirect("/login");
}
