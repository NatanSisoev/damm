import Link from "next/link";
import { Comments, People } from "../../glyphs";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getRecommendationDetail } from "@damm/db/hr";
import { signalDetail, signalHeadline } from "@/lib/signal-text";
import { Card, Empty, PageHeader } from "../../ui";
import { recommendationStatus } from "../../labels";
import { getTL } from "@/lib/i18n/server";
import { panelDict } from "@/lib/i18n/hr-panel";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { SignalBadges } from "../../signal-labels";
import { TrendChart } from "../../trend-chart";
import { approveFromDetailAction, discardFromDetailAction, followUpFromDetailAction } from "../actions";

const day = (s: string) => s.slice(0, 10);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-subtle">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, lang } = await getTL(panelDict);
  const detail = Number.isInteger(Number(id)) ? getRecommendationDetail(Number(id)) : null;
  if (!detail) notFound();
  const { recommendation: r, signal: sd, siblings, followUp } = detail;
  const status = recommendationStatus(r.estat, lang);
  const signal = sd?.signal ?? null;

  const people = `👤≥${MIN_GROUP_SIZE}`;
  const steps = [
    { label: t("rd_step_proposed"), detail: `${day(r.creat)}${r.font ? ` · ${r.font === "llm" ? t("rd_by_ai") : t("rd_template")}` : ""}`, done: true },
    { label: t("rd_step_decision"), detail: r.estat === "aprovada" ? t("rd_approved_on", { date: r.aprovadaEl ? day(r.aprovadaEl) : "?" }) : r.estat === "descartada" ? t("rd_discarded") : t("rd_pending"), done: r.estat !== "proposada" },
    { label: t("rd_step_followup"), detail: followUp ? (followUp.published ? t("rd_published") : t("rd_created_unpublished")) : r.seguimentNecessitatId ? t("rd_created") : t("rd_to_create"), done: !!r.seguimentNecessitatId },
    { label: t("rd_step_results"), detail: followUp?.newResults ? t("rd_available") : t("rd_need_people", { people }), done: !!followUp?.newResults },
  ];
  const trendScope = sd ? sd.trendScope.split(" · ").map((x) => (x === "Tots" ? t("rd_all") : collectiveLabel(x, lang) !== x ? collectiveLabel(x, lang) : shiftLabel(x, lang))).join(" · ") : "";

  return (
    <>
      <PageHeader
        title={r.titol ?? t("rd_title_fallback", { id: r.id })}
        subtitle={r.titol ? r.text : undefined}
        actions={<Link href="/hr/recommendations" className="btn">{t("rd_back")}</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={`badge ${status.cls}`}>{status.label}</span>
        {r.seguimentNecessitatId && <span className="badge badge-accent">{t("rd_followup_created")}</span>}
        {signal && <span className="badge num">{signal.collectiu ? collectiveLabel(signal.collectiu, lang) : t("rd_all")}{signal.domini ? ` · ${domainLabel(signal.domini, lang)}` : ""}</span>}
        <span className="badge num">#{r.id}</span>
      </div>

      <Card title={t("rd_flow")} className="mb-6">
        <ol className="grid gap-4 sm:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-start gap-3 sm:border-l sm:border-line sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
              <span
                className={`num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  s.done ? "border-good bg-good-soft text-good" : "border-line-strong bg-surface-muted text-subtle"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div>
                <div className="text-[13px] font-medium">{s.label}</div>
                <div className="text-xs text-subtle">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card title={t("rd_proposal")}>
            <p className="text-[15px]">{r.text}</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {r.iniciativa && <Fact label={t("rd_f_initiative")}>{r.iniciativa}</Fact>}
              {r.responsableSuggerit && <Fact label={t("rd_f_owner")}>{r.responsableSuggerit}</Fact>}
              {r.terminiSuggerit && <Fact label={t("rd_f_deadline")}>{r.terminiSuggerit}</Fact>}
              <Fact label={t("rd_f_origin")}>{r.font === "llm" ? t("rd_origin_llm") : r.font === "template" ? t("rd_origin_template") : t("rd_origin_none")}</Fact>
            </dl>
            {r.justificacio && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-xs font-medium text-subtle">{t("rd_why")}</h3>
                <p className="mt-1 text-[13px] text-muted">{r.justificacio}</p>
              </div>
            )}
            {r.limits && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-xs font-medium text-subtle">{t("rd_limits")}</h3>
                <p className="mt-1 text-[13px] text-muted">{r.limits}</p>
              </div>
            )}
            <p className="mt-4 text-xs text-subtle">{t("rd_ai_note")}</p>
            {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                {r.estat === "proposada" && (
                  <>
                    <form action={discardFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn">{t("rd_discard")}</button></form>
                    <form action={approveFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">{t("rd_approve")}</button></form>
                  </>
                )}
                {r.estat === "aprovada" && (
                  <form action={followUpFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">{t("rd_create_followup")}</button></form>
                )}
              </div>
            )}
          </Card>

          {sd && signal && (
            <Card title={t("rd_trend_title", { scope: trendScope })} meta={t("rd_trend_meta")} flush>
              {sd.trend.length === 0 ? (
                <div className="px-5 pb-5"><Empty>{t("rd_no_aggregates")}</Empty></div>
              ) : (
                <TrendChart periodes={sd.periodes} rows={sd.trend} highlight={sd.trend.filter((t) => t.related).map((t) => t.domini)} scale="0-10" />
              )}
            </Card>
          )}

          {sd && (
            <Card title={t("rd_themes")} meta={`👤≥${MIN_GROUP_SIZE}`}>
              {sd.themes.length === 0 ? (
                <Empty>{t("rd_no_themes")}</Empty>
              ) : (
                <ul className="space-y-4">
                  {sd.themes.map((th) => (
                    <li key={th.id} className="rounded-lg border border-line p-4">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{th.etiqueta}</h3>
                        {th.emergent && <span className="badge badge-warn">{t("rd_emerging")}</span>}
                        <span className="num ml-auto text-xs text-subtle"><Comments n={th.n} /></span>
                      </div>
                      {th.resum && <p className="text-[13px] text-muted">{th.resum}</p>}
                      {th.snippets.map((s, i) => (
                        <p key={i} className="mt-2 border-l-2 border-line-strong pl-3 text-[13px] italic text-muted">«{s}»</p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={t("rd_source_alarm")}>
            {signal ? (
              <>
                <h3 className="font-medium">{signalHeadline(signal, lang)}</h3>
                <p className="mt-1 text-[13px] text-muted">{signalDetail(signal, lang)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SignalBadges tipus={signal.tipus} severity={signal.severity} status={signal.status} />
                  <span className="badge num">{signal.periode}</span>
                  <span className="badge num"><People n={signal.n} scoped={signal.collectiuId !== null || (signal.tornId ?? null) !== null} /></span>
                  {signal.confianca !== null && <span className="badge num">{t("rd_confidence", { pct: Math.round(signal.confianca <= 1 ? signal.confianca * 100 : signal.confianca) })}</span>}
                </div>
                <Link href={`/hr/signals/${signal.id}`} className="mt-3 inline-block text-xs text-accent-ink hover:underline">{t("rd_open_alarm")}</Link>
              </>
            ) : (
              <Empty>{t("rd_no_alarm")}</Empty>
            )}
          </Card>

          <Card title={t("rd_followup_card")}>
            {!r.seguimentNecessitatId || !followUp ? (
              <Empty>{t("rd_no_followup")}</Empty>
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${followUp.published ? "badge-good" : "badge-warn"}`}>{followUp.published ? t("rd_published") : t("rd_unpublished")}</span>
                  <Link href="/hr/needs" className="ml-auto text-xs text-accent-ink hover:underline">{t("rd_review_publish")}</Link>
                </div>
                <p className="text-[13px] font-medium">{followUp.textNl}</p>
                {followUp.questions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
                    {followUp.questions.map((q) => (
                      <li key={q.id}>{q.text} <span className="text-xs text-subtle">({q.estat === "aprovada" ? t("rd_q_approved") : t("rd_q_draft")})</span></li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-subtle">
                  {followUp.newResults
                    ? <>{t("rd_new_results")} <span className="num"><People n={followUp.newResults.n} /></span>{followUp.newResults.mitjana !== null && <> · {t("rd_mean")} <span className="num">{numD(followUp.newResults.mitjana, lang, 1)}</span></>}</>
                    : t("rd_results_pending", { people })}
                </p>
              </div>
            )}
          </Card>

          {siblings.length > 0 && (
            <Card title={t("rd_siblings")} meta={<span className="num">{siblings.length}</span>}>
              <ul className="space-y-2">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/hr/recommendations/${s.id}`} className="block rounded-lg border border-line p-3 hover:bg-surface-muted">
                      <span className={`badge ${recommendationStatus(s.estat, lang).cls}`}>{recommendationStatus(s.estat, lang).label}</span>
                      <span className="mt-1 block text-[13px]">{s.titol ?? s.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
