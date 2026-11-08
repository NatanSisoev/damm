import { redirect } from "next/navigation";

// The detailed results now live on the Panell. Kept so old links still work.
export default function ResultsRedirect() {
  redirect("/hr");
}
