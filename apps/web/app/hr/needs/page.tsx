import type { ReactNode } from "react";
import Link from "next/link";
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { listCollectius, listDomains, listNeedCards, listNeedDrafts, type NeedCard, type NeedState } from "@damm/db/hr";
import { ConfirmButton } from "../confirm-button";
import { closeNeedAction, publishAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { needStatus, questionTypeLabel } from "../labels";
import { getTL } from "@/lib/i18n/server";
import { LOCALES, type TFn } from "@/lib/i18n/core";
import { hrDict, collectiveLabel, domainLabel, type HrKey } from "@/lib/i18n/hr";
import { DraftReview } from "./draft-review";
import { NeedForm } from "./need-form";

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

export default async function NeedsPage({ searchParams }: { searchParams: Promise<{ estat?: string; publicada?: string; avis?: string; nova?: string }> }) {
  const { estat, publicada, avis, nova } = await searchParams;
  const { t, lang } = await getTL(hrDict);
  const filter: Filter = isFilter(estat) ? estat : "totes";
  const all = listNeedCards();
  const drafts = new Map(listNeedDrafts().map((g) => [g.id, g]));
  const domainIdx = new Map(listDomains().map((d, i) => [d.nom, i + 1]));
  const counts = Object.fromEntries(STATES.map((s) => [s.key, all.filter((n) => n.state === s.key).length])) as Record<NeedState, number>;
  const shown = filter === "totes" ? all : all.filter((n) => n.state === filter);
  const rank = (n: NeedCard) => STATES.findIndex((s) => s.key === n.state);
  shown.sort((a, b) => rank(a) - rank(b) || b.id - a.id);
  const showForm = all.length === 0 || nova === "1";

  return (
    <>
      <PageHeader
        title={t("needs_title")}
        subtitle={t("needs_subtitle")}
        actions={
          <Link href={showForm ? "/hr/needs" : "/hr/needs?nova=1#nova"} className="btn btn-primary" aria-expanded={showForm}>
            {showForm && all.length > 0 ? t("needs_close_form") : t("needs_new_btn")}
          </Link>
        }
      />
      {publicada && avis && /^(off|<?\d+)$/.test(avis) && <PublishNotice avis={avis} t={t} />}
      {showForm && (
        <section id="nova" className="card mb-6">
          <div className="card-header">
            <h2 className="section-title">{t("needs_new_title")}</h2>
            <span className="text-xs text-subtle">{t("needs_new_note")}</span>
          </div>
          <div className="card-body">
            <NeedForm collectius={listCollectius()} />
          </div>
        </section>
      )}

      {all.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("needs_filter_aria")} className="hr-seg">
            {([{ key: "totes", label: t("needs_filter_all"), n: all.length }, ...STATES.map((s) => ({ key: s.key, label: needStatus(s.key, lang).label, n: counts[s.key] }))] as { key: Filter; label: string; n: number }[]).map((f) => {
              const disabled = f.key !== "totes" && f.n === 0 && filter !== f.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === "totes" ? "/hr/needs" : `/hr/needs?estat=${f.key}`}
                  aria-current={filter === f.key ? "page" : undefined}
                  aria-disabled={disabled || undefined}
                  tabIndex={disabled ? -1 : undefined}
                >
                  {f.label}
                  {f.n > 0 && <span className="num">{f.n}</span>}
                </Link>
              );
            })}
          </nav>
          <p className="text-xs text-subtle">{t("needs_flow")}</p>
        </div>
      )}

      {all.length > 0 && shown.length === 0 && filter !== "totes" && (
        <Empty>
          <p>{t(STATES.find((s) => s.key === filter)!.empty)}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/hr/needs?nova=1#nova" className="btn btn-primary">{t("needs_new_btn")}</Link>
            <Link href="/hr/needs" className="btn btn-ghost">{t("needs_show_all")}</Link>
          </div>
        </Empty>
      )}
      {shown.length > 0 && (
        <div className="space-y-4">
          {shown.map((n) => (
            <NeedItem key={n.id} n={n} draft={drafts.get(n.id)} domainIdx={domainIdx} t={t} lang={lang} />
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

function NeedItem({ n, draft, domainIdx, t, lang }: { n: NeedCard; draft?: ReturnType<typeof listNeedDrafts>[number]; domainIdx: Map<string, number>; t: TFn<HrKey>; lang: Lang }) {
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
        {n.titol && <p className="text-sm text-subtle">{t("need_text_prefix", { text: n.textNl })}</p>}
        <p className="text-xs text-subtle">{t(state.hint)}</p>

        {draft && <DraftReview g={draft} />}

        {n.approved.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">
              {t("need_approved_qs")} <span className="num text-subtle">{n.approved.length}{n.nDraft > 0 ? ` · ${t("need_to_review", { n: n.nDraft })}` : ""}</span>
            </h3>
            <ul className="hr-qlist">
              {n.approved.map((q) => (
                <li key={q.id}>
                  <span className="hr-chip-dot mt-1.5" style={{ background: `var(--dom-${domainIdx.get(q.domini) ?? "muted"})` }} title={domainLabel(q.domini, lang)} aria-hidden />
                  <span>
                    {q.text}
                    <span className="block text-xs text-subtle">{domainLabel(q.domini, lang)}</span>
                  </span>
                  <span className="hr-qmeta">
                    {questionTypeLabel(q.tipus, lang)}
                    {live && <span className="num block">{q.answers != null ? t("need_answers", { n: q.answers }) : t("need_answers_few", { min: MIN_GROUP_SIZE })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {n.duradaMaxS != null && <p className="text-xs text-subtle">{t("need_max_duration", { n: n.duradaMaxS })}</p>}

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
              <button className="btn btn-primary">{t("need_publish")}</button>
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

/** Result of the last publish: an aggregate device count only, never who was notified. */
function PublishNotice({ avis, t }: { avis: string; t: TFn<HrKey> }) {
  const text =
    avis === "off"
      ? t("notice_off")
      : avis.startsWith("<")
        ? t("notice_few", { min: MIN_GROUP_SIZE })
        : t("notice_n", { n: avis });
  return (
    <p role="status" className="mb-6 rounded-lg border border-line-strong px-3 py-2 text-sm">
      {text}
    </p>
  );
}
