import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hrPoolQuestion } from "@/lib/hr-engine";
import { EvolutionChart } from "./evolution-chart";
import { ConfirmButton } from "../../confirm-button";
import { setQuestionActiveAction } from "../../actions";
import { Card, Empty, PageHeader, Stat } from "../../ui";
import { questionTypeLabel } from "../../labels";
import { REASON, STATE } from "../labels";
import { getTL } from "@/lib/i18n/server";
import { poolDict } from "@/lib/i18n/hr-pool";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { needStatus } from "../../labels";

export const dynamic = "force-dynamic";

const MIN = 10;
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> }) {
  const { id } = await params;
  const { t, lang } = await getTL(poolDict);
  const num = (x: number) => numD(x, lang, 0);
  const score10 = (x: number | null) => (x === null ? t("d_suppressed") : numD(x * 10, lang, 1));
  const grain = (await searchParams).g === "day" ? "day" : "week";
  const d = Number.isInteger(Number(id)) ? hrPoolQuestion(Number(id), grain) : null;
  if (!d) notFound();
  const q = d.question;
  const st = STATE[q.state];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-3 text-sm"><Link href="/hr/pool">{t("back")}</Link></p>
      <PageHeader
        title={q.text}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`badge ${st.cls}`}>{t(st.key)}</span>
            <span className="badge">{questionTypeLabel(q.type, lang)}</span>
            <span className="badge">{domainLabel(q.domain, lang)}</span>
            <span className="badge">{collectiveLabel(q.collective, lang)}</span>
            {q.facet && <span className="badge">{q.facet}</span>}
            {q.needId !== null && <span className="badge badge-accent">{t("need_n", { n: q.needId })}</span>}
            {q.isFollowup && <span className="badge">{t("badge_followup")}</span>}
            {q.aiGenerated && <span className="badge">{t("badge_ai")}</span>}
            <span className="text-xs text-subtle">{t(REASON[q.reason])}</span>
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <Stat label={t("d_asked")} value={num(q.asked)} hint={t("stat_last7", { n: q.asked7d })} />
        <Stat label={t("d_responses")} value={num(q.responses)} hint={t("stat_last7", { n: q.responses7d })} />
        <Stat label={t("d_rate")} value={pct(q.answerRate)} hint={t("d_assignments", { a: num(q.answeredAssigned), b: num(q.asked) })} />
        <Stat label={t("d_confidence")} value={q.confidence === null ? "—" : Math.round(q.confidence)} hint={q.confidence === null ? (q.type === "open" || q.type === "ranking" ? t("d_conf_na") : t("d_suppressed_people", { n: MIN })) : t("d_conf_hint")} />
        <Stat label={t("d_consensus")} value={q.consensus === null ? "—" : Math.round(q.consensus)} hint={q.consensus === null ? undefined : t("d_consensus_hint")} />
        <Stat label={t("d_reach")} value={`${num(q.reachedAccounts)} / ${num(q.eligibleAccounts)}`} hint={t("d_reach_hint")} />
        <Stat label={t("d_avg")} value={q.avgScore === null ? "—" : `${score10(q.avgScore)} / 10`} hint={q.avgScore === null ? t("d_suppressed_resp", { n: MIN }) : t("d_avg_hint")} />
        <Stat
          label={t("d_next")}
          value={q.nextBatchDay ?? "—"}
          hint={q.state === "live" && q.askedPerDay14 > 0 ? t("d_assign_day", { n: q.askedPerDay14 }) : q.pendingAccounts !== null ? t("pending_n", { n: num(q.pendingAccounts) }) : undefined}
        />
      </div>

      <Card
        title={t("d_evolution")}
        meta={
          <nav aria-label={t("d_granularity")} className="hr-seg">
            <Link href={`/hr/pool/${q.id}`} aria-current={grain === "week" ? "page" : undefined}>{t("d_weeks")}</Link>
            <Link href={`/hr/pool/${q.id}?g=day`} aria-current={grain === "day" ? "page" : undefined}>{t("d_days")}</Link>
          </nav>
        }
        className="mb-6"
      >
        {d.weekly.length === 0 ? <Empty>{t("d_no_activity")}</Empty> : <EvolutionChart buckets={d.weekly} grain={grain} />}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("d_distribution")} meta={d.distribution?.note}>
          {d.distribution ? (
            <Bars bars={d.distribution.bars} />
          ) : (
            <Empty>{q.type === "open" ? t("d_open_no_dist") : t("d_suppressed_lt", { n: MIN })}</Empty>
          )}
        </Card>
        <Card title={t("d_by_period")} flush>
          <table className="table">
            <thead><tr><th>{t("d_period")}</th><th className="text-right">{t("d_responses")}</th><th className="text-right">{t("d_score")}</th></tr></thead>
            <tbody>
              {d.periods.length === 0 && <tr><td colSpan={3} className="text-subtle">{t("d_no_responses")}</td></tr>}
              {d.periods.map((p) => (
                <tr key={p.periode}><td>{p.periode}</td><td className="num text-right">{num(p.responses)}</td><td className="num text-right">{score10(p.avgScore)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title={t("d_by_segment")} meta={t("d_by_segment_meta", { n: MIN })} className="mb-6" flush>
        <table className="table">
          <thead><tr><th>{t("f_collective")}</th><th>{t("d_shift")}</th><th className="text-right">{t("d_responses")}</th><th className="text-right">{t("d_score")}</th></tr></thead>
          <tbody>
            {d.segments.length === 0 && <tr><td colSpan={4} className="text-subtle">{t("d_no_responses")}</td></tr>}
            {d.segments.map((s, i) => (
              <tr key={i}><td>{collectiveLabel(s.collective, lang)}</td><td>{s.shift ? shiftLabel(s.shift, lang) : "—"}</td><td className="num text-right">{num(s.responses)}</td><td className="num text-right">{score10(s.avgScore)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("d_config")}>
          <Dl
            rows={[
              [t("d_format"), `${questionTypeLabel(q.type, lang)} (${q.type})`],
              [t("d_db_status"), t(`qs_${q.dbStatus}` as "qs_draft")],
              [t("d_priority"), String(q.priority)],
              [t("d_order"), String(q.order)],
              [t("d_polarity"), q.polarity === 1 ? t("d_positive") : t("d_negative")],
              [t("d_facet"), q.facet ?? "—"],
              [t("d_origin"), q.aiGenerated ? t("src_ai") : t("src_human")],
              [t("d_ai_reason"), q.aiReason ?? "—"],
              [t("d_approved_by"), q.approvedBy ? `${q.approvedBy}${q.approvedAt ? ` · ${q.approvedAt.slice(0, 16)}` : ""}` : "—"],
              [t("d_need"), q.needId === null ? t("continuous") : `${q.needTitle ?? ""} (${needStatus(q.needStatus ?? "", lang).label})`],
              [t("d_bias"), d.itemBias ? `${numD(d.itemBias.bias, lang, 3)} (n=${d.itemBias.n})` : "—"],
            ]}
          />
          {q.options && (
            <div className="mt-4">
              <p className="label mb-1">{t("d_options")}</p>
              <ol className="list-decimal pl-5 text-[13px]">
                {q.options.map((o, i) => (
                  <li key={i}>
                    {o.label}
                    {typeof o.score === "number" && <span className="text-subtle">{t("d_option_value", { n: o.score })}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
        <Card title={t("d_delivery")}>
          <Dl
            rows={[
              [t("d_first"), q.firstAskedDay ?? "—"],
              [t("d_last_asked"), q.lastAskedDay ?? "—"],
              [t("d_last_answer"), q.lastAnsweredAt ? q.lastAnsweredAt.slice(0, 16) : "—"],
              [t("d_today_batches"), String(q.inTodayBatches)],
              [t("d_assigned_as"), t("d_assigned_as_value", { m: q.askedByReason.monitor, n: q.askedByReason.need, f: q.askedByReason.followup })],
              [t("d_pace"), t("d_pace_value", { n: q.askedPerDay14 })],
              [t("d_answer_time"), q.avgAnswerMs === null ? "—" : `${numD(q.avgAnswerMs / 1000, lang, 1)} s${q.carelessShare !== null ? t("d_too_fast", { pct: pct(q.carelessShare) }) : ""}`],
              [t("d_comments"), q.comments === null ? "—" : String(q.comments)],
            ]}
          />
          {(q.dbStatus === "aprovada" || q.dbStatus === "retirada") && (
            <form action={setQuestionActiveAction} className="mt-4">
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="active" value={q.dbStatus === "retirada" ? "1" : "0"} />
              {q.dbStatus === "aprovada" ? (
                <ConfirmButton message={t("d_retire_confirm")} className="btn btn-ghost border border-line-strong px-3 py-1.5">
                  {t("d_retire")}
                </ConfirmButton>
              ) : (
                <button type="submit" className="btn btn-ghost border border-line-strong px-3 py-1.5">{t("d_restore")}</button>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function Dl({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-[13px] leading-snug">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="text-subtle">{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Bars({ bars }: { bars: { label: string; count: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <ul className="space-y-2">
      {bars.map((b) => (
        <li key={b.label} className="grid grid-cols-[minmax(3rem,10rem)_1fr_3.5rem] items-center gap-3 text-[13px]">
          <span className="truncate" title={b.label}>{b.label}</span>
          <span className="h-3 bg-surface-muted">
            <span className="block h-3" style={{ width: `${(b.count / max) * 100}%`, background: "var(--co-2, currentColor)" }} />
          </span>
          <span className="num text-right">{b.count}</span>
        </li>
      ))}
    </ul>
  );
}
