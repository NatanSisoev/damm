"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PoolNextResponse, PostResponsesRequest } from "@damm/shared";
import {
  EMPTY_DRAFT,
  isAnswerable,
  QuestionRenderer,
  type AnswerDraft,
  type PoolQuestion,
} from "./question-renderer";

type Phase = "loading" | "answering" | "done" | "error";

// Shows today's questions one at a time. Each answer is sent as soon as it is confirmed, so
// leaving halfway loses nothing. The account is identified by the session cookie only.
export function AnswerFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<AnswerDraft>(EMPTY_DRAFT);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [answeredAny, setAnsweredAny] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/pool/next", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PoolNextResponse;
        if (!live) return;
        setQuestions(body.preguntes);
        setPhase(body.preguntes.length ? "answering" : "done");
      })
      .catch(() => live && setPhase("error"));
    return () => {
      live = false;
    };
  }, [router]);

  const q = questions[index];

  async function submit() {
    if (!q || !isAnswerable(q, draft) || sending) return;
    setSending(true);
    setMessage(null);
    const payload: PostResponsesRequest = {
      respostes: [
        q.tipus === "obert"
          ? { preguntaId: q.id, comentari: draft.comentari.trim() }
          : { preguntaId: q.id, valorNum: draft.valorNum },
      ],
      canal: "app",
    };
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      // 409: already answered today (another tab); treat as done and move on.
      if (res.status !== 204 && res.status !== 409) {
        setMessage("No s'ha pogut enviar. Torna-ho a provar.");
        return;
      }
      setAnsweredAny(true);
      setDraft(EMPTY_DRAFT);
      if (index + 1 < questions.length) setIndex(index + 1);
      else setPhase("done");
    } catch {
      setMessage("Sense connexió. Torna-ho a provar.");
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") {
    return <p className="py-16 text-center text-muted">Carregant…</p>;
  }
  if (phase === "error") {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">No s&apos;han pogut carregar les preguntes.</p>
        <button type="button" className="btn mt-4 h-11" onClick={() => window.location.reload()}>
          Torna-ho a provar
        </button>
      </div>
    );
  }
  if (phase === "done" || !q) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold">Res més per avui</h2>
        <p className="mt-2 text-muted">
          {answeredAny ? "Gràcies! Les teves respostes són anònimes." : "Torna demà per noves preguntes."}
        </p>
      </div>
    );
  }

  const last = index + 1 === questions.length;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between text-sm text-muted">
          <span className="num">
            {index + 1} de {questions.length}
          </span>
          <span className="badge">Anònim</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <QuestionRenderer question={q} draft={draft} onChange={setDraft} />

      <div className="mt-auto pt-8">
        {message && (
          <p role="alert" className="mb-3 text-sm text-accent-ink">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!isAnswerable(q, draft) || sending}
          className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {sending ? "Enviant…" : last ? "Envia" : "Envia i continua"}
        </button>
      </div>
    </div>
  );
}
