"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PoolNextResponse, PostResponsesRequest } from "@damm/shared";
import {
  EMPTY_DRAFT,
  isAnswerable,
  QuestionRenderer,
  type AnswerDraft,
  type PoolQuestion,
} from "./question-renderer";

type Phase = "loading" | "answering" | "done" | "error";

// In-progress answers live on this device only (never sent anywhere until the person submits).
// Keyed by account and question id; every access is guarded because storage can be blocked.
const DRAFT_PREFIX = "damm:draft:v1:";
const draftKey = (compteId: string, qid: number) => `${DRAFT_PREFIX}${compteId}:${qid}`;

function loadDraft(compteId: string, qid: number): AnswerDraft {
  try {
    const raw = window.localStorage.getItem(draftKey(compteId, qid));
    if (!raw) return EMPTY_DRAFT;
    const v = JSON.parse(raw) as Partial<AnswerDraft>;
    return {
      valorNum: typeof v.valorNum === "number" ? v.valorNum : null,
      comentari: typeof v.comentari === "string" ? v.comentari : "",
      valueJson: Array.isArray(v.valueJson) && v.valueJson.every((n) => typeof n === "number") ? v.valueJson : null,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(compteId: string, qid: number, d: AnswerDraft) {
  try {
    const empty = d.valorNum === null && d.valueJson === null && d.comentari === "";
    if (empty) window.localStorage.removeItem(draftKey(compteId, qid));
    else window.localStorage.setItem(draftKey(compteId, qid), JSON.stringify(d));
  } catch {
    /* storage unavailable: the draft just won't survive a reload */
  }
}

/** Drops this account's drafts for questions that are no longer in today's pool. */
function pruneDrafts(compteId: string, keep: number[]) {
  try {
    const mine = `${DRAFT_PREFIX}${compteId}:`;
    const keepKeys = new Set(keep.map((id) => draftKey(compteId, id)));
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(mine) && !keepKeys.has(k)) stale.push(k);
    }
    for (const k of stale) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// Shows today's questions one at a time. Each answer is sent as soon as it is confirmed, so
// leaving halfway loses nothing; the answer being typed is kept in localStorage until sent. The account is identified by the session cookie only.
export function AnswerFlow({ compteId }: { compteId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<AnswerDraft>(EMPTY_DRAFT);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [answeredAny, setAnsweredAny] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState(false);

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
        pruneDrafts(compteId, body.preguntes.map((p) => p.id));
        setQuestions(body.preguntes);
        setIndex(0);
        setDraft(body.preguntes[0] ? loadDraft(compteId, body.preguntes[0].id) : EMPTY_DRAFT);
        setPhase(body.preguntes.length ? "answering" : "done");
      })
      .catch(() => {
        if (!live) return;
        setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
        setPhase("error");
      });
    return () => {
      live = false;
    };
  }, [router, compteId, attempt]);

  const q = questions[index];

  function retryLoad() {
    setOffline(false);
    setPhase("loading");
    setAttempt((n) => n + 1);
  }

  function changeDraft(d: AnswerDraft) {
    setDraft(d);
    if (q) saveDraft(compteId, q.id, d);
  }
  // Time from display to answer, for careless-answer detection (C1 answer_ms).
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, [q?.id]);

  async function submit() {
    if (!q || !isAnswerable(q, draft) || sending) return;
    setSending(true);
    setMessage(null);
    const payload: PostResponsesRequest = {
      respostes: [
        q.tipus === "open"
          ? { preguntaId: q.id, comentari: draft.comentari.trim() }
          : {
              preguntaId: q.id,
              valorNum: draft.valorNum,
              valueJson: draft.valueJson,
              answerMs: Math.max(0, Math.round(performance.now() - shownAt.current)),
            },
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
        setMessage("No s'ha pogut enviar la resposta. La teva resposta continua aquí: torna-ho a provar.");
        return;
      }
      setAnsweredAny(true);
      saveDraft(compteId, q.id, EMPTY_DRAFT);
      const nextQ = questions[index + 1];
      setDraft(nextQ ? loadDraft(compteId, nextQ.id) : EMPTY_DRAFT);
      if (nextQ) setIndex(index + 1);
      else setPhase("done");
    } catch {
      setMessage(
        navigator.onLine === false
          ? "Sense connexió. La teva resposta continua aquí: torna-ho a provar quan tornis a tenir connexió."
          : "No hem pogut connectar amb el servidor. La teva resposta continua aquí: torna-ho a provar.",
      );
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") {
    return (
      <div role="status" aria-busy="true" aria-live="polite" className="py-4">
        <span className="sr-only">Carregant les preguntes d&apos;avui…</span>
        <div aria-hidden className="animate-pulse">
          <div className="mb-6 h-1.5 rounded-full bg-surface-muted" />
          <div className="mb-3 h-6 w-4/5 rounded bg-surface-muted" />
          <div className="mb-8 h-6 w-3/5 rounded bg-surface-muted" />
          <div className="h-14 rounded-xl bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="text-muted">
          {offline
            ? "Sembla que no tens connexió. Comprova la connexió i torna-ho a provar."
            : "No s'han pogut carregar les preguntes."}
        </p>
        <button type="button" className="btn mt-4 h-11" onClick={retryLoad}>
          Torna-ho a provar
        </button>
      </div>
    );
  }
  if (phase === "done" || !q) {
    return (
      <div>
        <section className="hop rounded-[28px] px-5 pb-8 pt-8">
          <h2 className="out text-[48px]">Gràcies</h2>
          <p className="hop-lede mt-3 max-w-sm text-base">
            {answeredAny || questions.length
              ? `Has respost ${questions.length === 1 ? "la pregunta" : `les ${questions.length} preguntes`} d'avui. Demà en tens de noves.`
              : "Avui ja has acabat. Demà en tens de noves."}
          </p>
        </section>
        <p className="mt-4 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-muted">
          <span aria-hidden>🔒 </span>Anònim de debò. No et demanem nom ni correu. Només veiem grups de 10 persones o més.
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
            Pregunta {index + 1} de {questions.length}
          </span>
          <span className="tag">Anònim</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <QuestionRenderer question={q} draft={draft} onChange={changeDraft} />

      <div className="mt-auto pt-8">
        {message && (
          <p role="alert" className="mb-3 font-semibold text-accent-ink">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!isAnswerable(q, draft) || sending}
          className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-40"
        >
          {sending ? "Enviant…" : message ? "Torna-ho a provar" : last ? "Envia" : "Envia i continua"}
        </button>
      </div>
    </div>
  );
}
