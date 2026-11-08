import { redirect } from "next/navigation";

/** Proposals live on each alarm now; the old list URL goes to Alarms. */
export default function RecommendationsPage() {
  redirect("/hr/signals");
}
