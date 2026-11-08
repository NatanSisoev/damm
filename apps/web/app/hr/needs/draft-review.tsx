import { estimateSeconds, questionWarnings, wordLimit } from "@damm/ai";
import type { NeedDraftGroup } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { draftReviewDict } from "@/lib/i18n/hr-draft-review";
import { domainLabel } from "@/lib/i18n/names";
import {
  approveQuestionAction, discardQuestionAction, editNeedHeaderAction, editQuestionAction, moveDraftAction,
  regenerateQuestionAction,
} from "../actions";

/** Draft review for one need: title and intro, then each proposed question with its actions. */
export async function DraftReview({ g, regenError = null }: { g: NeedDraftGroup; regenError?: number | null }) {
  const { t, lang } = await getTL(draftReviewDict);
  const { t: th } = await getTL(hrDict);
  const typeLabel = (tipus: string) => (t(`type_${tipus}` as never) === `type_${tipus}` ? tipus : t(`type_${tipus}` as never));
  const secs = estimateSeconds(g.questions.map((q) => q.tipusAi));
  // A query with a question count shows "N questions per person" and its delivery mode; the seconds budget
  // only applies to older queries and follow-ups that still carry one.
  const counted = g.questionCount != null;
  const over = !counted && g.duradaMaxS != null && secs > g.duradaMaxS;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {g.draftFont === "fallback" ? (
          <span className="badge" title={t("fallback_title")}>{t("fallback_badge")}</span>
        ) : (
          <span className="badge badge-accent">{t("ai_badge")}</span>
        )}
        {counted ? (
          <>
            <span className="badge num">{th("need_question_count", { n: g.questionCount! })}</span>
            <span className={`badge ${g.delivery === "campaign" ? "badge-accent" : ""}`}>{th(g.delivery === "campaign" ? "need_delivery_campaign" : "need_delivery_daily")}</span>
          </>
        ) : (
          <span className={`badge num ${over ? "badge-warn" : ""}`}>
            ~{secs} s{g.duradaMaxS != null ? ` / ${g.duradaMaxS} s` : ""}
          </span>
        )}
        <span className="num text-xs text-subtle">{t("to_review", { n: g.questions.length })}</span>
      </div>
      {over && (
        <p role="alert" className="mt-3 rounded-lg border border-line-strong px-3 py-2 text-sm">
          {t("over_budget", { min: Math.ceil(secs / 60), max: `${Math.round((g.duradaMaxS ?? 0) / 60)} min` })}
        </p>
      )}
      <form action={editNeedHeaderAction} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={g.id} />
        <input name="titol" defaultValue={g.titol ?? ""} aria-label={t("title_label")} placeholder={t("title_label")} className="input w-full" />
        <textarea name="intro" defaultValue={g.intro ?? ""} aria-label={t("intro_label")} placeholder={t("intro_label")} rows={2} className="input w-full resize-y" />
        <button className="btn btn-ghost">{t("save_header")}</button>
      </form>
      <p className="mt-3 text-xs text-subtle">{t("translations_hint")}</p>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {g.questions.map((q, i) => (
          <li key={q.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-xs text-subtle">{i + 1}.</span>
              <span className="badge">{domainLabel(q.domini, lang)}</span>
              <span className="badge">{typeLabel(q.tipus)}</span>
              <span className="num text-xs text-subtle">~{estimateSeconds([q.tipusAi])} s</span>
            </div>
            {q.motiu && <p className="text-sm text-subtle">{t("why", { reason: q.motiu })}</p>}
            {(() => {
              // Same wording rules the AI repair loop uses, re-run on the saved text so HR edits are checked too.
              const warns = questionWarnings({ exclusions: g.exclusions, collective: g.collectiu }, { text: q.text, type: q.tipusAi, reason: q.motiu });
              if (warns.length === 0) return null;
              return (
                <div role="status" className="rounded-lg border border-warn px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-warn">{t("warn_title")}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {warns.map((w) => (
                      <li key={w.code}>{t(`w_${w.code}` as never, { topics: w.detail ?? "", n: w.n ?? 0, max: wordLimit(g.collectiu) } as never)}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <form action={editQuestionAction} className="w-full min-w-0 space-y-2">
                <input type="hidden" name="id" value={q.id} />
                <label className="block text-xs text-subtle">
                  {t("text_ca")}
                  <input name="text" defaultValue={q.text} aria-label={`${t("text_label")} (${t("text_ca")})`} className="input mt-1 w-full" />
                </label>
                <label className="block text-xs text-subtle">
                  {t("text_es")}
                  <input name="text_es" defaultValue={q.textEs ?? ""} lang="es" aria-label={`${t("text_label")} (${t("text_es")})`} className="input mt-1 w-full" />
                </label>
                <label className="block text-xs text-subtle">
                  {t("text_en")}
                  <input name="text_en" defaultValue={q.textEn ?? ""} lang="en" aria-label={`${t("text_label")} (${t("text_en")})`} className="input mt-1 w-full" />
                </label>
                {(!q.textEs || !q.textEn) && <p className="text-xs text-subtle">{t("translations_missing")}</p>}
                <button className="btn btn-ghost">{t("save_text")}</button>
              </form>
              <form action={moveDraftAction}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn btn-ghost" disabled={i === 0} aria-label={t("move_up")}>↑</button>
              </form>
              <form action={moveDraftAction}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn btn-ghost" disabled={i === g.questions.length - 1} aria-label={t("move_down")}>↓</button>
              </form>
              <form action={regenerateQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn btn-ghost">{t("regenerate")}</button>
                {regenError === q.id && <p role="alert" className="mt-1 text-xs font-semibold text-warn">{t("regenerate_failed")}</p>}
              </form>
              <form action={discardQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn">{t("discard")}</button>
              </form>
              <form action={approveQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn btn-primary">{t("approve")}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
