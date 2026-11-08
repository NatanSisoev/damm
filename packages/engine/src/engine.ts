// Employee-side engine API: daily batch and answer submission. docs/engine-integration.md.
import type { Canal, QuestionType } from "@damm/shared";
import { selectBatch, type DomainSignal } from "./batch.ts";
import { resolveConfig, type EngineConfig } from "./config.ts";
import { run, transaction, type SqlDatabase } from "./db.ts";
import { isClosed, learn } from "./learn.ts";
import { activeProbeBoosts } from "./probe.ts";
import { parseAnswer, type QuestionDef } from "./normalize.ts";
import { createRng } from "./rng.ts";
import { computeSignals } from "./signals.ts";
import * as store from "./store.ts";
import { dayOf, toSqlDatetime } from "./time.ts";

export interface EngineOptions {
  db: SqlDatabase;
  /** PII redaction for comments, owned by the AI module. Required: the engine never stores raw text. */
  redact: (text: string) => string;
  /** Clock, injectable for tests and demos. */
  now?: () => number;
  /** Config overrides on top of engine_config (tests, simulations). */
  config?: Partial<EngineConfig>;
}

export interface BatchItem {
  assignmentId: number;
  questionId: number;
  domainId: number;
  type: QuestionType;
  text: string;
  /** pair/choice/ranking: labels in index order. Option scores are never sent to the client. */
  options: { label: string }[] | null;
  scale: { min: number; max: number } | null;
  isFollowup: boolean;
  answered: boolean;
}

export interface DailyBatch {
  day: string;
  total: number;
  answered: number;
  items: BatchItem[];
}

export interface AnswerInput {
  preguntaId: number;
  valorNum?: number | null;
  valueJson?: number[] | null;
  answerMs?: number | null;
  comentari?: string | null;
}

export type RejectReason = "not_in_todays_batch" | "already_answered" | "invalid_value" | "missing_comment";

export interface SubmitResult {
  accepted: number[];
  rejected: { questionId: number; reason: RejectReason }[];
  remainingToday: number;
}

export class EngineError extends Error {}

export interface Engine {
  getDailyBatch(accountId: string): DailyBatch;
  submitAnswers(accountId: string, answers: AnswerInput[], opts?: { channel?: Canal }): SubmitResult;
}

const DAY_MS = 86_400_000;

const SCALES: Partial<Record<QuestionType, { min: number; max: number }>> = {
  scale5: { min: 1, max: 5 },
  scale10: { min: 0, max: 10 },
};

export function createEngine(opts: EngineOptions): Engine {
  if (typeof opts.redact !== "function") throw new EngineError("createEngine needs a redact function");
  const { db, redact } = opts;
  const now = opts.now ?? Date.now;
  const config = (): EngineConfig => resolveConfig(db, opts.config);

  function account(accountId: string) {
    const a = store.getAccount(db, accountId);
    if (!a) throw new EngineError("unknown account");
    return a;
  }

  // Segment statistics per collective, cached for the day: recomputing them on every batch request
  // scans every person in the collective (quadratic in headcount over a day). HR weights stay live.
  const signalCache = new Map<string, Omit<DomainSignal, "weight">[]>();

  function domainSignals(cfg: EngineConfig, collectiuId: number, tornId: number | null, nowMs: number): DomainSignal[] {
    const probes = activeProbeBoosts(db, collectiuId, tornId, nowMs); // per shift and live, so outside the daily cache
    const weight = store.domainWeights(db, collectiuId);
    const key = `${collectiuId}|${dayOf(nowMs, cfg.timezone)}`;
    let base = signalCache.get(key);
    if (!base) {
      if (signalCache.size > 64) signalCache.clear();
      base = computeSignals(db, cfg, collectiuId, nowMs);
      signalCache.set(key, base);
    }
    return base.map((s) => ({ ...s, weight: weight(s.domainId), probeBoost: probes.get(s.domainId) ?? 1 }));
  }

  function toItem(row: store.AssignmentRow, q: QuestionDef): BatchItem {
    return {
      assignmentId: row.id,
      questionId: q.id,
      domainId: q.domainId,
      type: q.type,
      text: q.text,
      options: q.options ? q.options.map((o) => ({ label: o.label })) : null,
      scale: SCALES[q.type] ?? null,
      isFollowup: row.reason === "followup" || q.isFollowup,
      answered: row.answered_at !== null,
    };
  }

  function getDailyBatch(accountId: string): DailyBatch {
    const cfg = config();
    const nowMs = now();
    const day = dayOf(nowMs, cfg.timezone);
    const acc = account(accountId);
    let rows = store.assignmentsFor(db, accountId, day);
    transaction(db, () => {
      if (rows.length === 0) {
        const picks = selectBatch({
          cfg,
          rng: createRng(`${accountId}|${day}`),
          day,
          questions: store.approvedQuestionsFor(db, acc.collectiuId),
          lastSeen: store.lastSeenByItem(db, accountId),
          answered: store.answeredQuestionIds(db, accountId),
          dueFollowups: store.dueFollowupDomains(db, accountId, day),
          domains: domainSignals(cfg, acc.collectiuId, acc.tornId, nowMs),
          formatPref: store.formatPrefs(db, acc.collectiuId),
          formatStats: store.formatStatsFor(db, cfg, acc.collectiuId, acc.tornId),
        });
        // OR IGNORE: a concurrent request may have created today's batch first; we then read theirs.
        picks.forEach((p, slot) =>
          run(db, "INSERT OR IGNORE INTO assignment (compte_id, pregunta_id, day, slot, reason) VALUES (?,?,?,?,?)", accountId, p.question.id, day, slot, p.reason),
        );
      }
    });
    rows = store.assignmentsFor(db, accountId, day);
    const qs = store.questionsByIds(db, rows.map((r) => r.pregunta_id));
    const items = rows.flatMap((r) => {
      const q = qs.get(r.pregunta_id);
      return q ? [toItem(r, q)] : [];
    });
    return { day, total: items.length, answered: items.filter((i) => i.answered).length, items };
  }

  function submitAnswers(accountId: string, answers: AnswerInput[], o: { channel?: Canal } = {}): SubmitResult {
    const cfg = config();
    const nowMs = now();
    const day = dayOf(nowMs, cfg.timezone);
    const at = toSqlDatetime(nowMs);
    const acc = account(accountId);
    const result: SubmitResult = { accepted: [], rejected: [], remainingToday: 0 };

    transaction(db, () => {
      const rows = store.assignmentsFor(db, accountId, day);
      const byQuestion = new Map(rows.map((r) => [r.pregunta_id, r]));
      const qs = store.questionsByIds(db, rows.map((r) => r.pregunta_id));
      const done = new Set<number>();

      for (const a of Array.isArray(answers) ? answers : []) {
        // Anything that is not an answer object (null, a number, a string) cannot belong to today's batch.
        const id = (a as Partial<AnswerInput> | null)?.preguntaId;
        const row = typeof id === "number" ? byQuestion.get(id) : undefined;
        const q = typeof id === "number" ? qs.get(id) : undefined;
        if (!row || !q) {
          result.rejected.push({ questionId: id as number, reason: "not_in_todays_batch" });
          continue;
        }
        if (row.answered_at !== null || done.has(a.preguntaId)) {
          result.rejected.push({ questionId: a.preguntaId, reason: "already_answered" });
          continue;
        }
        const parsed = parseAnswer(q, a);
        if (!parsed.ok) {
          result.rejected.push({ questionId: a.preguntaId, reason: parsed.reason });
          continue;
        }
        const { score, valorNum, valueJson } = parsed.value;
        const comment = typeof a.comentari === "string" && a.comentari.trim() ? redact(a.comentari.trim()) : null;
        // A day is the longest answer time worth keeping; NaN, infinity and absurd values are dropped, not stored.
        const answerMs = typeof a.answerMs === "number" && Number.isFinite(a.answerMs) && a.answerMs >= 0 && a.answerMs <= DAY_MS ? Math.round(a.answerMs) : null;

        run(
          db,
          `INSERT INTO resposta (compte_id, pregunta_id, valor_num, value_json, score, answer_ms, comentari, canal, periode, data)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          accountId,
          q.id,
          valorNum,
          valueJson ? JSON.stringify(valueJson) : null,
          score,
          answerMs,
          comment,
          o.channel ?? "app",
          day.slice(0, 7),
          at,
        );

        if (score !== null && isClosed(q.type)) {
          const out = learn(
            {
              person: store.getPersonState(db, accountId, q.domainId),
              item: store.getItemStats(db, q.id),
              question: q,
              score,
              at,
              day,
              isFollowup: row.reason === "followup" || q.isFollowup,
            },
            cfg,
            createRng(`${accountId}|${q.domainId}|${day}`),
          );
          store.putPersonState(db, accountId, q.domainId, out.person);
          store.putItemStats(db, q.id, out.item);
        }
        if (answerMs !== null) store.bumpFormatStats(db, cfg, acc.collectiuId, acc.tornId, q.type, answerMs >= cfg.minAnswerMs);

        run(db, "UPDATE assignment SET answered_at = ? WHERE id = ?", at, row.id);
        done.add(q.id);
        result.accepted.push(q.id);
      }
      result.remainingToday = rows.filter((r) => r.answered_at === null && !done.has(r.pregunta_id)).length;
    });
    return result;
  }

  return { getDailyBatch, submitAnswers };
}
