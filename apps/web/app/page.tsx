import Link from "next/link";
import { redirect } from "next/navigation";
import { getCompteId } from "@/lib/session";
import { AnswerFlow } from "./(employee)/components/answer-flow";

export const dynamic = "force-dynamic";

// Employee home: today's questions, one at a time. Without a session the person goes to login.
export default async function Home() {
  if (!(await getCompteId())) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-6 pt-4">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">Escolta activa</h1>
        <Link href="/settings" className="btn btn-ghost h-10">
          Configuració
        </Link>
      </header>
      <AnswerFlow />
    </main>
  );
}
