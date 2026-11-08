"use client";

import { useRouter } from "next/navigation";
import { EarSymbol } from "../../wordmark";
import { useEffect, useRef, useState } from "react";
import { MIN_GROUP_SIZE, type PoolCampaign, type PoolNextResponse, type PostResponsesRequest, type PostResponsesResult } from "@damm/shared";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";
import { PrivacyNote } from "./frame";
import {
  EMPTY_DRAFT,
  isAnswerable,
  QuestionRenderer,
  type AnswerDraft,
  type PoolQuestion,
} from "./question-renderer";

type Phase = "loading" | "campaign_intro" | "answering" | "done" | "error";
type Section = "daily" | "campaign";

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
  const t = useT(employeeDict);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<PoolQuestion[]>([]);
  const [index, setIndex] = useState(0);
  // The extra one-off query set (campaign) is shown after the daily questions, clearly labelled.
  const [campaign, setCampaign] = useState<PoolCampaign | null>(null);
  const [section, setSection] = useState<Section>("daily");
  const [campaignDone, setCampaignDone] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [draft, setDraft] = useState<AnswerDraft>(EMPTY_DRAFT);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [answeredAny, setAnsweredAny] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState(false);
  // Conditional follow-ups (served right after a low answer / a "no"): skippable, not part of the question count.
  const [followupIds, setFollowupIds] = useState<Set<number>>(new Set());

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
        const extra = body.campaign && body.campaign.preguntes.length ? body.campaign : null;
        pruneDrafts(compteId, [...body.preguntes, ...(extra?.preguntes ?? [])].map((p) => p.id));
        setCampaign(extra);
        setCampaignDone(false);
        setSection("daily");
        setDailyCount(body.preguntes.length);
        setQuestions(body.preguntes);
        setIndex(0);
        setDraft(body.preguntes[0] ? loadDraft(compteId, body.preguntes[0].id) : EMPTY_DRAFT);
        setPhase(body.preguntes.length ? "answering" : extra ? "campaign_intro" : "done");
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

  /** Moves on after an answer (or a skipped follow-up), optionally inserting follow-ups right after the current question. */
  function advance(inserted: PoolQuestion[] = []) {
    const list = inserted.length ? [...questions.slice(0, index + 1), ...inserted, ...questions.slice(index + 1)] : questions;
    if (inserted.length) {
      setQuestions(list);
      setFollowupIds((prev) => new Set([...prev, ...inserted.map((f) => f.id)]));
    }
    const nextQ = list[index + 1];
    setDraft(nextQ ? loadDraft(compteId, nextQ.id) : EMPTY_DRAFT);
    if (nextQ) setIndex(index + 1);
    else if (section === "daily" && campaign) setPhase("campaign_intro");
    else {
      if (section === "campaign") setCampaignDone(true);
      setPhase("done");
    }
  }

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
              // Optional free comment on any non-text answer; never required.
              ...(draft.comentari.trim() ? { comentari: draft.comentari.trim() } : {}),
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
      if (res.status !== 204 && res.status !== 409 && res.status !== 200) {
        setMessage(t("err_send"));
        return;
      }
      setAnsweredAny(true);
      saveDraft(compteId, q.id, EMPTY_DRAFT);
      let inserted: PoolQuestion[] = [];
      if (res.status === 200) {
        try {
          inserted = ((await res.json()) as PostResponsesResult).followups;
        } catch {
          /* no usable body: just carry on without a follow-up */
        }
      }
      advance(inserted);
    } catch {
      setMessage(
        navigator.onLine === false
          ? t("err_send_offline")
          : t("err_send_server"),
      );
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") {
    return (
      <div role="status" aria-busy="true" aria-live="polite" className="py-4">
        <span className="sr-only">{t("home_loading")}</span>
        <div aria-hidden className="animate-pulse">
          <div className="mb-6 h-1.5  bg-surface-muted" />
          <div className="mb-3 h-6 w-4/5 rounded bg-surface-muted" />
          <div className="mb-8 h-6 w-3/5 rounded bg-surface-muted" />
          <div className="h-14 bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="py-16 text-center">
        <p role="alert" className="text-muted">
          {offline
            ? t("home_offline")
            : t("home_load_failed")}
        </p>
        <button type="button" className="btn mt-4 h-11" onClick={retryLoad}>
          {t("retry")}
        </button>
      </div>
    );
  }
  function startCampaign() {
    if (!campaign) return;
    setSection("campaign");
    setQuestions(campaign.preguntes);
    setIndex(0);
    setDraft(campaign.preguntes[0] ? loadDraft(compteId, campaign.preguntes[0].id) : EMPTY_DRAFT);
    setPhase("answering");
  }

  if (phase === "campaign_intro" && campaign) {
    return (
      <div className="flex flex-1 flex-col">
        <section className="border-b border-line pb-6 pt-4">
          <p className="eyebrow">{t("campaign_eyebrow")}</p>
          <h2 className="page-title mt-2">{campaign.title || t("campaign_title_fallback")}</h2>
          {campaign.intro && <p className="mt-3 max-w-sm">{campaign.intro}</p>}
          <p className="mt-3 max-w-sm text-muted">{t("campaign_lede", { n: campaign.preguntes.length })}</p>
        </section>
        <div className="mt-4">
          <PrivacyNote>{t("privacy_note_short", { min: MIN_GROUP_SIZE })}</PrivacyNote>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <button type="button" onClick={startCampaign} className="btn btn-primary h-14 w-full justify-center text-base">
            {t("campaign_start")}
          </button>
          <button type="button" onClick={() => setPhase("done")} className="btn h-11 w-full justify-center">
            {t("campaign_later")}
          </button>
        </div>
      </div>
    );
  }
  if (phase === "done" || !q) {
    return (
      <div>
        <section className="border-b border-line pb-6 pt-4">
          <EarSymbol pulse className="mb-4" />
          <h2 className="display">{t("thanks")}</h2>
          <p className="mt-3 max-w-sm text-muted">
            {dailyCount > 0 || (answeredAny && !campaignDone)
              ? dailyCount === 1
                ? t("done_one")
                : t("done_many", { n: dailyCount })
              : t("done_none")}
          </p>
          {campaignDone && <p className="mt-3 max-w-sm text-muted">{t("campaign_done")}</p>}
          {!campaignDone && campaign && <p className="mt-3 max-w-sm text-muted">{t("campaign_later_note")}</p>}
        </section>
        <div className="mt-4">
          <PrivacyNote>{t("privacy_note_short", { min: MIN_GROUP_SIZE })}</PrivacyNote>
        </div>
      </div>
    );
  }

  const last = index + 1 === questions.length;
  const isFollowup = followupIds.has(q.id);
  // Follow-ups are an extra, so the progress counts only the regular questions.
  const regular = questions.filter((x) => !followupIds.has(x.id));
  const regularIndex = questions.slice(0, index + 1).filter((x) => !followupIds.has(x.id)).length;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between text-sm text-muted">
          <span className="num">
            {isFollowup ? t("followup_badge") : t("question_of", { i: regularIndex, n: regular.length })}
          </span>
          <span className="eyebrow">{section === "campaign" ? `${t("campaign_badge")} · ${t("anonymous")}` : t("anonymous")}</span>
        </div>
        <div className="h-1.5 overflow-hidden  bg-surface-muted">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${(regularIndex / Math.max(1, regular.length)) * 100}%` }}
          />
        </div>
      </div>

      <QuestionRenderer question={q} draft={draft} onChange={changeDraft} />

      {q.tipus !== "open" && (
        <details className="mt-6" open={draft.comentari !== ""}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted">{t("comment_add")}</summary>
          <textarea
            className="input mt-2 w-full text-base"
            rows={3}
            maxLength={500}
            value={draft.comentari}
            onChange={(e) => changeDraft({ ...draft, comentari: e.target.value })}
            placeholder={t("comment_placeholder")}
            aria-label={t("comment_add")}
          />
          <p className="mt-1 text-sm text-muted">{t("open_note")}</p>
        </details>
      )}

      <div className="mt-auto pt-8">
        {message && (
          <p role="alert" className="mb-3 font-semibold text-warn">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!isAnswerable(q, draft) || sending}
          className="btn btn-primary h-14 w-full justify-center text-base disabled:opacity-40"
        >
          {sending ? t("sending") : message ? t("retry") : last ? t("send") : t("send_continue")}
        </button>
        {isFollowup && (
          <button type="button" onClick={() => advance()} disabled={sending} className="btn mt-2 h-11 w-full justify-center">
            {t("followup_skip")}
          </button>
        )}
      </div>
    </div>
  );
}
