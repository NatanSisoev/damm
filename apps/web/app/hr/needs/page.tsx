import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/app/hr/submit-button";
import Link from "next/link";
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { listDecisions, listDomains, listNeedCards, listNeedDrafts, type NeedCard, type NeedState } from "@damm/db/hr";
import { ConfirmButton } from "../confirm-button";
import { closeNeedAction, publishAction, remindNeedAction } from "../actions";
import { LOW_PARTICIPATION_PCT, participationOf } from "../participation";
import { Card, Empty, PageHeader } from "../ui";
import { needStatus, questionTypeLabel } from "../labels";
import { getTL } from "@/lib/i18n/server";
import { LOCALES, type TFn } from "@/lib/i18n/core";
import { hrDict, collectiveLabel, domainLabel, type HrKey } from "@/lib/i18n/hr";
import { trailDict } from "@/lib/i18n/hr-trail";
import { makeT } from "@/lib/i18n/core";
import { DecisionList } from "../trail";
import { DraftReview } from "./draft-review";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_needs");

export const dynamic = "force-dynamic";

const STATES: { key: NeedState; hint: HrKey; empty: HrKey }[] = [
  { key: "esborrany", hint: "hint_draft", empty: "empty_draft" },
  { key: "llesta", hint: "hint_ready", empty: "empty_ready" },
  { key: "publicada", hint: "hint_published", empty: "empty_published" },
  { key: "tancada", hint: "hint_closed", empty: "empty_closed" },
];

type Filter = NeedState | "totes";
const isFilter = (v: string | undefined): v is Filter => v === "totes" || STATES.some((s) => s.key === v);

const STATE_ICON: Record<NeedState, string> = {
  esborrany: "M4 3h6l3 3v7H4z M10 3v3h3", // page
  llesta: "M3 8.5l3 3 7-7", // check
  publicada: "M2 8l11-5-3 11-2.5-4.5z", // paper plane
  tancada: "M4 7V5a4 4 0 0 1 8 0v2 M3 7h10v7H3z", // lock
};

function StateBadge({ state, lang }: { state: NeedState; lang: Lang }) {
  const cls = state === "publicada" ? "badge-good" : state === "llesta" ? "badge-accent" : "";
  return (
    <span className={`badge ${cls}`}>
      <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={STATE_ICON[state]} />
      </svg>
      {needStatus(state, lang).label}
    </span>
  );
}

const fmtDate = (d: string | null, lang: Lang) => (d ? new Date(d.replace(" ", "T") + "Z").toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short", year: "numeric" }) : null);

export default async function NeedsPage({ searchParams }: { searchParams: Promise<{ estat?: string; publicada?: string; recordatori?: string; avis?: string; nova?: string; regenError?: string }> }) {
  const { estat, publicada, recordatori, avis, nova, regenError } = await searchParams;
  const { t, lang } = await getTL(hrDict);
  const filter: Filter = isFilter(estat) ? estat : "totes";
  const all = listNeedCards(lang);
  const drafts = new Map(listNeedDrafts().map((g) => [g.id, g]));
  const domainIdx = new Map(listDomains().map((d, i) => [d.nom, i + 1]));
  const counts = Object.fromEntries(STATES.map((s) => [s.key, all.filter((n) => n.state === s.key).length])) as Record<NeedState, number>;
  const shown = filter === "totes" ? all : all.filter((n) => n.state === filter);
  const rank = (n: NeedCard) => STATES.findIndex((s) => s.key === n.state);
  shown.sort((a, b) => rank(a) - rank(b) || b.id - a.id);
  // Old links to the inline form (?nova=1) now go to the dedicated page.
  if (nova === "1") redirect("/hr/needs/new");

  return (
    <>
      <PageHeader
        title={t("needs_title")}
        subtitle={t("needs_subtitle")}
        actions={<Link href="/hr/needs/new" className="btn btn-primary">{t("needs_new_btn")}</Link>}
      />
      {publicada && avis && /^(off|<?\d+)$/.test(avis) && <PublishNotice avis={avis} t={t} />}
      {recordatori && avis && /^(off|<?\d+)$/.test(avis) && <PublishNotice avis={avis} t={t} reminder />}
      {all.length === 0 && (
        <Empty>
          <p>{t("needs_empty")}</p>
          <div className="mt-3 flex justify-center">
            <Link href="/hr/needs/new" className="btn btn-primary">{t("needs_empty_btn")}</Link>
          </div>
        </Empty>
      )}

      {all.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("needs_filter_aria")} className="segmented">
            {([{ key: "totes", label: t("needs_filter_all"), n: all.length }, ...STATES.map((s) => ({ key: s.key, label: needStatus(s.key, lang).label, n: counts[s.key] }))] as { key: Filter; label: string; n: number }[]).map((f) => (
              <Link
                key={f.key}
                href={f.key === "totes" ? "/hr/needs" : `/hr/needs?estat=${f.key}`}
                aria-current={filter === f.key ? "true" : undefined}
              >
                {f.label} <span className="num ml-1.5 text-xs opacity-70">{f.n}</span>
              </Link>
            ))}
          </nav>
          <p className="text-xs text-subtle">{t("needs_flow")}</p>
        </div>
      )}

      {all.length > 0 && shown.length === 0 && filter !== "totes" && (
        <Empty>
          <p>{t(STATES.find((s) => s.key === filter)!.empty)}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/hr/needs/new" className="btn btn-primary">{t("needs_new_btn")}</Link>
            <Link href="/hr/needs" className="btn btn-ghost">{t("needs_show_all")}</Link>
          </div>
        </Empty>
      )}
      {all.length > 0 && shown.length > 0 && (
        <div className="space-y-4">
          {shown.map((n) => (
            <NeedItem key={n.id} n={n} draft={drafts.get(n.id)} domainIdx={domainIdx} t={t} lang={lang} regenError={Number(regenError) || null} />
          ))}
        </div>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function NeedItem({ n, draft, domainIdx, t, lang, regenError }: { n: NeedCard; draft?: ReturnType<typeof listNeedDrafts>[number]; domainIdx: Map<string, number>; t: TFn<HrKey>; lang: Lang; regenError: number | null }) {
  const state = STATES.find((s) => s.key === n.state)!;
  const live = n.state === "publicada" || n.state === "tancada";
  const pct = n.responses != null && n.population > 0 ? Math.min(100, Math.round((n.responses / n.population) * 100)) : null;
  const firstCode = n.publications[0]?.codi;
  const closeMsg = t("need_close_confirm");
  return (
    <Card title={n.titol ?? n.textNl} meta={<StateBadge state={n.state} lang={lang} />}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label={t("need_f_collective")}>{n.collectiu ? collectiveLabel(n.collectiu, lang) : t("all_collectives")}</Fact>
          <Fact label={t("need_f_created")}>{fmtDate(n.creat, lang) ?? "—"}</Fact>
          <Fact label={t("need_f_published")}>{fmtDate(n.publicat, lang) ?? (live ? t("need_date_unrecorded") : t("need_not_yet"))}</Fact>
          <Fact label={t("need_f_participation")}>
            {!live ? (
              t("need_no_answers_yet")
            ) : pct == null ? (
              <span title={t("need_fewer_than", { min: MIN_GROUP_SIZE })}>{n.responses == null ? t("need_answers_few", { min: MIN_GROUP_SIZE }) : "—"}</span>
            ) : (
              <span className="num">{n.responses} / {n.population} ({pct} %)</span>
            )}
          </Fact>
        </dl>
        {live && pct != null && (
          <div className="hr-bar" role="img" aria-label={t("need_participation_aria", { pct })}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {n.state === "publicada" && (() => {
          const part = participationOf(n);
          if (!part.low) return null;
          return (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn px-3 py-2 text-sm">
              <div>
                <p className="font-semibold text-warn">{t("part_low_title")}</p>
                <p className="mt-0.5">{part.pct == null ? t("part_low_few", { min: MIN_GROUP_SIZE }) : t("part_low_pct", { pct: part.pct, limit: LOW_PARTICIPATION_PCT })}</p>
              </div>
              <form action={remindNeedAction}>
                <input type="hidden" name="id" value={n.id} />
                <SubmitButton className="btn">{t("remind_btn")}</SubmitButton>
              </form>
            </div>
          );
        })()}
        {n.titol && <p className="text-sm text-subtle">{t("need_text_prefix", { text: n.textNl })}</p>}
        <p className="text-xs text-subtle">{t(state.hint)}</p>

        {draft && <DraftReview g={draft} regenError={regenError} />}

        {n.approved.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">
              {t("need_approved_qs")} <span className="num text-subtle">{n.approved.length}{n.nDraft > 0 ? ` · ${t("need_to_review", { n: n.nDraft })}` : ""}</span>
            </h3>
            <ul className="hr-qlist">
              {n.approved.map((q) => (
                <li key={q.id}>
                  <span className="hr-chip-dot mt-1.5" style={{ background: `var(--dom-${domainIdx.get(q.domini) ?? "muted"})` }} title={domainLabel(q.domini, lang)} aria-hidden />
                  <Link href={`/hr/pool/${q.id}`} className="hover:underline">
                    {q.text}
                    <span className="block text-xs text-subtle">{domainLabel(q.domini, lang)}</span>
                  </Link>
                  <span className="hr-qmeta">
                    {questionTypeLabel(q.tipus, lang)}
                    {live && <span className="num block">{q.answers != null ? t("need_answers", { n: q.answers }) : t("need_answers_few", { min: MIN_GROUP_SIZE })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {n.questionCount != null ? (
          <p className="text-xs text-subtle">
            {t("need_question_count", { n: n.questionCount })} · {t(n.delivery === "campaign" ? "need_delivery_campaign" : "need_delivery_daily")}
          </p>
        ) : (
          n.duradaMaxS != null && <p className="text-xs text-subtle">{t("need_max_duration", { n: n.duradaMaxS })}</p>
        )}

        <NeedTrail needId={n.id} lang={lang} />
        <div className="hr-actions flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {n.state === "esborrany" && n.approved.length === 0 && n.nDraft === 0 && <p className="mr-auto text-sm text-subtle">{t("need_no_questions")}</p>}
          {live && (
            <Link href="/hr/results" className="btn btn-ghost">{t("need_see_results")}</Link>
          )}
          {n.state === "publicada" && (
            <Link href={firstCode ? `/hr/publish#${firstCode}` : "/hr/publish"} className="btn btn-ghost">{t("need_links_qr")}</Link>
          )}
          {(n.state === "esborrany" && n.approved.length > 0 || n.state === "llesta") && (
            <form action={publishAction}>
              <input type="hidden" name="id" value={n.id} />
              <ConfirmButton
                className="btn btn-primary"
                title={t("pubm_title")}
                busyLabel={t("pubm_busy")}
                message={
                  <>
                    <p className="text-muted">{n.titol ?? n.textNl}</p>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Fact label={t("pubm_who")}>{n.collectiu ? collectiveLabel(n.collectiu, lang) : t("all_collectives")} · {t("pubm_people", { n: n.population })}</Fact>
                      <Fact label={t("pubm_questions")}>{t("pubm_approved", { n: n.approved.length })}{n.questionCount != null && <> · {t("need_question_count", { n: n.questionCount })}</>}</Fact>
                      <Fact label={t("pubm_how")}>{t(n.delivery === "campaign" ? "need_delivery_campaign" : "need_delivery_daily")}</Fact>
                    </dl>
                    {n.nDraft > 0 && <p className="mt-4 text-[13px] font-medium">{t("pubm_drafts", { n: n.nDraft })}</p>}
                    <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">{t("pubm_note", { min: MIN_GROUP_SIZE })}</p>
                  </>
                }
              >
                {t("need_publish")}
              </ConfirmButton>
            </form>
          )}
          {n.state !== "tancada" && (
            <form action={closeNeedAction}>
              <input type="hidden" name="id" value={n.id} />
              <ConfirmButton className="btn btn-ghost" message={closeMsg}>{t("need_close")}</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

/** The need's decision trail, folded: who approved, edited, discarded or published what, and where each proposal came from. */
function NeedTrail({ needId, lang }: { needId: number; lang: Lang }) {
  const t = makeT(trailDict, lang);
  const rows = listDecisions({ necessitatId: needId, limit: 30 });
  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {t("tr_trail_for_need")} <span className="num ml-1 font-normal text-subtle">{t("tr_trail_count", { n: rows.length })}</span>
      </summary>
      <div className="mt-2">
        {rows.length === 0 ? <p className="py-2 text-sm text-subtle">{t("tr_trail_empty")}</p> : <DecisionList rows={rows} lang={lang} />}
        <Link href="/hr/traceability" className="text-xs underline">{t("tr_see_all")}</Link>
      </div>
    </details>
  );
}

/** Result of the last publish: an aggregate device count only, never who was notified. */
function PublishNotice({ avis, t, reminder }: { avis: string; t: TFn<HrKey>; reminder?: boolean }) {
  const k = reminder ? { off: "remind_off", few: "remind_few", n: "remind_n" } as const : { off: "notice_off", few: "notice_few", n: "notice_n" } as const;
  const text = avis === "off" ? t(k.off) : avis.startsWith("<") ? t(k.few, { min: MIN_GROUP_SIZE }) : t(k.n, { n: avis });
  return (
    <p role="status" className="mb-6 rounded-lg border border-line-strong px-3 py-2 text-sm">
      {text}
    </p>
  );
}
