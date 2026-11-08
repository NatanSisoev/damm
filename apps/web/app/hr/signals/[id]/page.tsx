import Link from "next/link";
import { Comments, People } from "../../glyphs";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { getSignalDetail, type SignalTimelineStep } from "@damm/db/hr";

import { hrListProbes, type ProbeView } from "@/lib/hr-engine";
import { Card, Empty, PageHeader } from "../../ui";
import { SuppressedBadge } from "../../ui-server";
import { setSignalStatusAction } from "../../actions";
import "../alarms.css";
import { generateRecommendationsAction } from "../actions";
import { GenerateButton } from "../generate-button";
import { startProbeAction, stopProbeAction } from "./actions";

import { recommendationStatus } from "../../labels";
import { ChangeBadge, Sparkline } from "../../trend";
import { TrendChart } from "../../trend-chart";
import { STATUS_ORDER, SignalBadges, statusLabel } from "../../signal-labels";
import { signalDetail, signalHeadline } from "@/lib/signal-text";
import { getT, getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsKey, type HrResultsT } from "@/lib/i18n/hr-results";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { signalsDict } from "@/lib/i18n/hr-signals";
import { rich } from "@/lib/i18n/rich";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_alarm");

const NEXT: Partial<Record<SignalTimelineStep["key"], { href: string; label: HrResultsKey }>> = {
  recomanacio: { href: "#recomanacions", label: "sd_next_rec" },
  seguiment: { href: "#seguiment", label: "sd_next_follow" },
  resultats: { href: "#seguiment", label: "sd_next_results" },
};

// Timeline step label/detail come from the db package as Catalan strings; map them by step key and known value.
function timelineText(s: SignalTimelineStep, t: HrResultsT): { label: string; detail: string } {
  const label = t(`sd_tl_${s.key}` as HrResultsKey);
  const d = s.detail;
  let m: RegExpMatchArray | null;
  let detail = d;
  if ((m = d.match(/^Detectat (.+)$/))) detail = t("sd_td_detected", { p: m[1] });
  else if ((m = d.match(/^(\d+) aprovad/))) detail = t(Number(m[1]) > 1 ? "sd_td_approved_many" : "sd_td_approved_one", { n: m[1] });
  else if (d === "Pendent de decisió") detail = t("sd_td_undecided");
  else if (d === "Sense recomanació") detail = t("sd_td_no_rec");
  else if (d === "Publicada") detail = t("sd_td_published");
  else if (d === "Creada, sense publicar") detail = t("sd_td_created");
  else if (d === "Per crear") detail = t("sd_td_to_create");
  else if (d === "Disponibles") detail = t("sd_td_available");
  else if ((m = d.match(/^Cal n ≥ (\d+)$/))) detail = t("sd_td_need_n", { n: m[1] });
  return { label, detail };
}

function Timeline({ steps, t }: { steps: SignalTimelineStep[]; t: HrResultsT }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-4">
      {steps.map((s, i) => {
        const tx = timelineText(s, t);
        const next = s.state !== "done" ? NEXT[s.key] : undefined;
        const body = (
          <>
            <span
              className={`num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                s.state === "done"
                  ? "border-good bg-good-soft text-good"
                  : next
                    ? "border-line-strong bg-surface-muted text-subtle group-hover:border-ink group-hover:text-ink"
                    : "border-line-strong bg-surface-muted text-subtle"
              }`}
              aria-hidden
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <div>
              <div className={`text-[13px] font-medium ${next ? "group-hover:underline" : ""}`}>
                {tx.label}
                {next && <span aria-hidden className="ml-1 text-subtle">›</span>}
              </div>
              <div className="text-xs text-subtle">
                {s.state === "done" ? t("sd_done") : t("sd_pending")} · {tx.detail}
              </div>
            </div>
          </>
        );
        return (
        <li key={s.key} className="sm:border-l sm:border-line sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
          {next ? (
            <Link href={next.href} title={t(next.label)} className="group flex items-start gap-3">{body}</Link>
          ) : (
            <div className="flex items-start gap-3">{body}</div>
          )}
        </li>
        );
      })}
    </ol>
  );
}

/** Short label for a proposal: its title, else the first sentence of its text. */
function recTitle(r: { titol?: string | null; text: string }): string {
  if (r.titol) return r.titol;
  const first = r.text.split(/(?<=[.!?])\s/)[0];
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

const pct = (v: number) => `${Math.round(v <= 1 ? v * 100 : v)}%`;

function ProbeCard({ t, lang, probes, signal, error }: { t: HrResultsT; lang: Lang; probes: ProbeView[]; signal: { id: number; collectiuId: number | null; tornId: number | null; dominiId: number | null; collectiu: string | null; domini: string | null }; error?: string }) {
  const active = probes.filter((p) => p.status === "active");
  const canProbe = signal.collectiuId !== null && signal.dominiId !== null;
  return (
    <Card id="indagar" title={t("sd_probe")} meta={t("sd_probe_meta")}>
      <p className="mb-3 text-[13px] text-muted">
        {t("sd_probe_p", { domain: signal.domini ? domainLabel(signal.domini, lang) : t("sd_probe_this") })}
      </p>
      {error && <p role="alert" className="mb-3 rounded-lg border border-line-strong px-3 py-2 text-[13px]">{error}</p>}
      {active.length === 0 && (
        <form action={startProbeAction}>
          <input type="hidden" name="signal" value={signal.id} />
          <input type="hidden" name="collectiu" value={signal.collectiuId ?? ""} />
          <input type="hidden" name="torn" value={signal.tornId ?? ""} />
          <input type="hidden" name="domini" value={signal.dominiId ?? ""} />
          <button className="btn btn-primary" disabled={!canProbe}>{t("sd_probe_btn")}</button>
          {!canProbe && <span className="ml-3 text-xs text-subtle">{t("sd_probe_need")}</span>}
        </form>
      )}
      {probes.length > 0 && (
        <ul className={`${active.length === 0 ? "mt-4" : ""} space-y-3`}>
          {probes.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`badge ${p.status === "active" ? "badge-accent" : ""}`}>{p.status === "active" ? t("sd_probe_active") : p.status === "stopped" ? t("sd_probe_stopped") : t("sd_probe_done")}</span>
                <span className="num text-xs text-subtle">x{p.boost} · {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}</span>
                {p.status === "active" && <span className="num ml-auto text-xs">{t(p.daysLeft === 1 ? "sd_days_one" : "sd_days_many", { n: p.daysLeft })}</span>}
              </div>
              {!p.progress || p.progress.suppressed ? (
                <p className="text-[13px] text-subtle">{t("sd_probe_nodata", { min: MIN_GROUP_SIZE })}</p>
              ) : (
                <p className="text-[13px]">
                  {rich(t("sd_probe_extra"), { x: <span className="num">{p.progress.extraAnswers !== null ? `+${p.progress.extraAnswers}` : "–"}</span> })}
                  {p.progress.confidenceBefore !== null && p.progress.confidenceNow !== null && (
                    <> · {t("sd_probe_conf")} <span className="num">{pct(p.progress.confidenceBefore)} → {pct(p.progress.confidenceNow)}</span></>
                  )}
                </p>
              )}
              {p.status === "active" && (
                <form action={stopProbeAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="signal" value={signal.id} />
                  <button className="btn">{t("sd_probe_stop")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function SignalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ probeError?: string }> }) {
  const { id } = await params;
  const { t, lang } = await getTL(hrResultsDict);
  const ts = await getT(signalsDict);
  const { probeError } = await searchParams;
  const detail = Number.isInteger(Number(id)) ? getSignalDetail(Number(id), lang) : null;
  if (!detail) notFound();
  const { signal, periodes, trend, trendScope, themes, hiddenThemes, recommendations, followUps, timeline } = detail;
  const probes = hrListProbes(signal.id);

  return (
    <>
      <PageHeader
        title={signalHeadline(signal, lang)}
        subtitle={signalDetail(signal, lang)}
        actions={<Link href="/hr/signals" className="btn">{t("sd_back")}</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SignalBadges tipus={signal.tipus} severity={signal.severity} status={signal.status} />
        <span className="badge num">{signal.periode}</span>
        <span className="badge num"><People n={signal.n} scoped={signal.collectiuId !== null || (signal.tornId ?? null) !== null} /></span>
        {signal.confianca !== null && <span className="badge num">{t("sd_conf", { v: Math.round(signal.confianca <= 1 ? signal.confianca * 100 : signal.confianca) })}</span>}

      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-subtle">{t("sd_status_lbl")}</span>
        {STATUS_ORDER.map((st) => (
          <form key={st} action={setSignalStatusAction}>
            <input type="hidden" name="id" value={signal.id} />
            <input type="hidden" name="status" value={st} />
            <button className={`btn ${signal.status === st ? "btn-primary" : ""}`} disabled={signal.status === st} aria-pressed={signal.status === st}>
              {statusLabel(st, lang)}
            </button>
          </form>
        ))}
      </div>

      <Card title={t("sd_flow")} className="mb-6">
        <Timeline steps={timeline} t={t} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card
            title={t("sd_evo", { scope: trendScope.split(" · ").map((x) => (x === "Tots" ? t("sd_all") : collectiveLabel(x, lang) !== x ? collectiveLabel(x, lang) : shiftLabel(x, lang))).join(" · ") })}
            meta={t("sd_score010")}
            flush
          >
            {trend.length === 0 ? (
              <div className="px-5 pb-5"><Empty>{t("sd_trend_empty")}</Empty></div>
            ) : (
              <>
                <TrendChart periodes={periodes} rows={trend} highlight={trend.filter((r) => r.related).map((r) => r.domini)} scale="0-10" />
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-subtle">{t("rs_show_table")}</summary>
                  <div className="overflow-x-auto">
                <table className="table min-w-[32rem]">
                    <thead>
                      <tr>
                        <th>{t("tb_domain")}</th>
                        {periodes.map((p) => <th key={p} className="text-right">{p}</th>)}
                        <th className="text-right">{t("tb_change")}</th>
                        <th className="text-right">{t("tb_trend")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((r) => (
                        <tr key={r.domini} className={r.related ? "bg-accent-soft" : ""}>
                          <td className="font-medium">
                            {domainLabel(r.domini, lang)}
                            {r.related && <span className="badge badge-accent ml-2">{t("sd_related")}</span>}
                          </td>
                          {r.cells.map((c) => (
                            <td key={c.periode} className="num text-right">
                              {c.suprimit ? (
                                <SuppressedBadge title={t("hint_small", { min: MIN_GROUP_SIZE })} />
                              ) : c.mitjana === null ? (
                                <span className="text-subtle">–</span>
                              ) : (
                                <>
                                  {numD((c.mitjana - 1) * 2.5, lang, 1)}
                                  <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}><People n={c.n} /> · {t(`prec_${c.precisio === "sòlida" ? "solida" : c.precisio}` as HrResultsKey)}</div>

                                  {c.sd !== null && c.consensus !== null && (
                                    <div className="text-[11px] whitespace-nowrap text-subtle">{t("tb_sd_cons", { sd: numD(c.sd * 2.5, lang, 1), c: Math.round(c.consensus) })}</div>
                                  )}
                                </>
                              )}
                            </td>
                          ))}
                          <td className="text-right"><ChangeBadge canvi={r.canvi} /></td>
                          <td className="text-right"><Sparkline values={r.cells.map((c) => c.mitjana)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </details>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card fold title={<>{t("sd_themes")} <span className="num text-xs font-normal text-subtle">{themes.length}</span></>}>
            {themes.length === 0 ? (
              <Empty>{t("sd_themes_empty", { min: MIN_GROUP_SIZE })}</Empty>
            ) : (
              <ul className="space-y-3">
                {themes.map((th) => (
                  <li key={th.id} className="rounded-lg border border-line p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{th.etiqueta}</h3>
                      {th.emergent && <span className="badge badge-warn">{t("rs_emergent")}</span>}
                      <span className="num ml-auto text-xs text-subtle"><Comments n={th.n} /></span>

                    </div>
                    {th.resum && <p className="text-[13px] text-muted">{th.resum} <span className="text-xs text-subtle">{t("sd_ai_summary")}</span></p>}
                    {th.snippets.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {th.snippets.map((s, i) => (
                          <li key={i} className="border-l-2 border-line-strong pl-3 text-[13px] italic text-muted">«{s}»</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-subtle">
              {t("sd_themes_note", { min: MIN_GROUP_SIZE })}
              {hiddenThemes > 0 && ` ${t(hiddenThemes > 1 ? "sd_hidden_many" : "sd_hidden_one", { n: hiddenThemes, min: MIN_GROUP_SIZE })}`}
            </p>
          </Card>

          <Card id="recomanacions" title={t("sd_recs")} meta={<span className="num">{recommendations.length}</span>}>
            {recommendations.length === 0 ? (
              signal.dominiId != null ? (
                <div className="gen-panel">
                  <span className="gen-panel-mark" aria-hidden>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" /></svg>
                  </span>
                  <h3>{ts("no_recs_title")}</h3>
                  <p>{ts("no_recs_text")}</p>
                  <form action={generateRecommendationsAction}>
                    <input type="hidden" name="signal" value={signal.id} />
                    <GenerateButton variant="panel" />
                  </form>
                  <small>{ts("no_recs_note")}</small>
                </div>
              ) : (
                <Empty>{ts("no_recs_domain")}</Empty>
              )
            ) : (
              <ul className="divide-y divide-line">
                {recommendations.map((r) => (
                  <li key={r.id} className={r.estat === "descartada" ? "opacity-60" : ""}>
                    <Link href={`/hr/recommendations/${r.id}`} className="group flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium group-hover:underline">{recTitle(r)}</span>
                      <span className={`badge shrink-0 ${recommendationStatus(r.estat, lang).cls}`}>{recommendationStatus(r.estat, lang).label}</span>
                      <span aria-hidden className="text-subtle">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ProbeCard t={t} lang={lang} probes={probes} signal={signal} error={probeError} />

          <Card id="seguiment" title={t("sd_follow")}>
            {followUps.length === 0 ? (
              <Empty>{t("sd_follow_empty")}</Empty>
            ) : (
              <ul className="space-y-4">
                {followUps.map((f) => (
                  <li key={f.necessitatId} className="rounded-lg border border-line p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${f.published ? "badge-good" : "badge-warn"}`}>{f.published ? t("sd_published") : t("sd_unpublished")}</span>
                      <Link href="/hr/needs" className="ml-auto text-xs text-accent-ink hover:underline">{t("sd_review_pub")}</Link>
                    </div>
                    <p className="text-[13px] font-medium">{f.textNl}</p>
                    {f.questions.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
                        {f.questions.map((q) => (
                          <li key={q.id}>{q.text} <span className="text-xs text-subtle">({q.estat === "aprovada" ? t("sd_q_approved") : t("sd_q_draft")})</span></li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-subtle">{t("sd_noq")}</p>
                    )}
                    <p className="mt-3 text-xs text-subtle">
                      {f.newResults
                        ? <>{rich(hrResultsDict[lang].sd_newres, { n: <span className="num"><People n={f.newResults.n} /></span> })}{f.newResults.mitjana !== null && rich(hrResultsDict[lang].sd_newres_avg, { v: <span className="num">{numD(f.newResults.mitjana, lang, 1)}</span> })}</>
                        : t("sd_newres_pending", { min: MIN_GROUP_SIZE })}

                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
