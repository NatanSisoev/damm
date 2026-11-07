import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";
import { nLabel, getSignalDetail, listCollectius, listContextEvents, listDomains, listTorns, type SignalTimelineStep } from "@damm/db/hr";
import { hrInsights, hrListProbes, type ProbeView } from "@/lib/hr-engine";
import { Card, Empty, PageHeader, SuppressedBadge } from "../../ui";
import { setSignalStatusAction } from "../../actions";
import { addContextEventAction, approveFromSignalAction, discardFromSignalAction, followUpFromSignalAction, startProbeAction, stopProbeAction } from "./actions";

import { recommendationStatus } from "../../labels";
import { RecommendationBody } from "../../recommendation-card";
import { ChangeBadge, Sparkline } from "../../trend";
import { TrendChart } from "../../trend-chart";
import { STATUS_ORDER, SignalBadges, statusLabel } from "../../signal-labels";
import { signalDetail, signalHeadline } from "@/lib/signal-text";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsKey, type HrResultsT } from "@/lib/i18n/hr-results";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { rich } from "@/lib/i18n/rich";

const NEXT: Partial<Record<SignalTimelineStep["key"], { href: string; label: HrResultsKey }>> = {
  recomanacio: { href: "#recomanacions", label: "sd_next_rec" },
  seguiment: { href: "#seguiment", label: "sd_next_follow" },
  resultats: { href: "#seguiment", label: "sd_next_results" },
};

// Timeline step label/detail come from the db package (Catalan); only the chrome around them is translated.
function Timeline({ steps, t }: { steps: SignalTimelineStep[]; t: HrResultsT }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-start gap-3 sm:border-l sm:border-line sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
          <span
            className={`num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
              s.state === "done" ? "border-good bg-good-soft text-good" : "border-line-strong bg-surface-muted text-subtle"
            }`}
            aria-hidden
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <div>
            <div className="text-[13px] font-medium">{s.label}</div>
            <div className="text-xs text-subtle">
              {s.state === "done" ? t("sd_done") : t("sd_pending")} · {s.detail}
            </div>
            {s.state !== "done" && NEXT[s.key] && (
              <Link href={NEXT[s.key]!.href} className="mt-1 inline-block text-xs text-accent-ink hover:underline">{t(NEXT[s.key]!.label)} →</Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
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

export default async function SignalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ probeError?: string; eventError?: string }> }) {
  const { id } = await params;
  const { t, lang } = await getTL(hrResultsDict);
  const f1 = (v: number) => numD(v, lang, 1);
  const { probeError, eventError } = await searchParams;
  const detail = Number.isInteger(Number(id)) ? getSignalDetail(Number(id)) : null;
  if (!detail) notFound();
  const { signal, periodes, trend, trendScope, themes, hiddenThemes, recommendations, followUps, timeline } = detail;
  const probes = hrListProbes(signal.id);
  const sameSegment = (c: number | null, tn: number | null, d: number | null) =>
    (c === null || c === signal.collectiuId) && (tn === null || signal.tornId === null || tn === signal.tornId) && (d === null || d === signal.dominiId);
  // "Since" comparisons for this signal's segment. Correlation, never proof: the engine's own wording and limits go together.
  const effects = hrInsights({ role: "hr" }, { periode: "all", kind: "action_effect", collectiuId: signal.collectiuId ?? undefined })
    .filter((i): i is Extract<typeof i, { kind: "action_effect" }> => i.kind === "action_effect" && !i.suppressed && !!i.detail && sameSegment(i.collectiuId, i.tornId, i.domainId));
  const events = listContextEvents().filter((e) => sameSegment(e.collectiuId, e.tornId, e.dominiId));
  const collectius = listCollectius();
  const domains = listDomains();
  const torns = listTorns();

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
        <span className="badge num">{nLabel(signal.n, signal.collectiuId !== null || (signal.tornId ?? null) !== null)}</span>
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
            title={t("sd_evo", { scope: trendScope === "Tots" ? t("sd_all") : collectiveLabel(trendScope, lang) })}
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
                                  <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}>n={c.n} · {t(`prec_${c.precisio === "sòlida" ? "solida" : c.precisio}` as HrResultsKey)}</div>
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

          <Card title={t("sd_themes")} meta={`n ≥ ${MIN_GROUP_SIZE}`}>
            {themes.length === 0 ? (
              <Empty>{t("sd_themes_empty", { min: MIN_GROUP_SIZE })}</Empty>
            ) : (
              <ul className="space-y-4">
                {themes.map((th) => (
                  <li key={th.id} className="rounded-lg border border-line p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{th.etiqueta}</h3>
                      {th.emergent && <span className="badge badge-warn">{t("rs_emergent")}</span>}
                      <span className="num ml-auto text-xs text-subtle">{t("sd_theme_n", { n: th.n })}</span>
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
        </div>

        <div className="space-y-6">
          <Card id="recomanacions" title={t("sd_recs")} meta={<span className="num">{recommendations.length}</span>}>
            {recommendations.length === 0 ? (
              <Empty>{t("sd_recs_empty")}</Empty>
            ) : (
              <ul className="space-y-3">
                {recommendations.map((r) => (
                  <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`badge ${recommendationStatus(r.estat, lang).cls}`}>{recommendationStatus(r.estat, lang).label}</span>
                      {r.seguimentNecessitatId && <span className="badge badge-accent">{t("sd_follow_created")}</span>}
                    </div>
                    <RecommendationBody r={r} />
                    {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                        {r.estat === "proposada" && (
                          <>
                            <form action={discardFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn">{t("sd_discard")}</button></form>
                            <form action={approveFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">{t("sd_approve")}</button></form>
                          </>
                        )}
                        {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                          <form action={followUpFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">{t("sd_create_follow")}</button></form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ProbeCard t={t} lang={lang} probes={probes} signal={signal} error={probeError} />

          <Card id="context" title={t("sd_ctx")} meta={t("sd_ctx_meta")}>
            {effects.length === 0 ? (
              <Empty>{t("sd_ctx_empty")}</Empty>
            ) : (
              <ul className="space-y-3">
                {effects.map((i) => {
                  const d = i.detail!;
                  return (
                    <li key={i.id} className="rounded-lg border border-line p-4">
                      <div className="mb-1 text-xs font-medium text-subtle">{t("sd_since", { since: d.since, label: d.anchor.label })}</div>
                      <p className="text-[13px]">{d.wording}</p>
                      <p className="mt-1 text-xs text-subtle">
                        <span className="num">{f1(d.before.score)} → {f1(d.after.score)}</span> · n={d.before.n} / {d.after.n}
                      </p>
                      <p className="mt-1 text-xs text-subtle">{d.limits}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            <h3 className="mt-5 mb-2 text-[13px] font-medium">{t("sd_events")}</h3>
            {events.length === 0 ? (
              <p className="text-xs text-subtle">{t("sd_events_empty")}</p>
            ) : (
              <ul className="mb-3 space-y-1 text-[13px]">
                {events.map((e) => (
                  <li key={e.id}><span className="num text-subtle">{e.date}</span> · {e.label}</li>
                ))}
              </ul>
            )}
            {eventError && <p role="alert" className="mb-2 text-[13px]">{eventError}</p>}
            <form action={addContextEventAction} className="space-y-2 border-t border-line pt-3">
              <input type="hidden" name="signal" value={signal.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-subtle">{t("sd_date")}<input type="date" name="date" required className="input mt-1 w-full" /></label>
                <label className="text-xs text-subtle">{t("sd_what")}<input type="text" name="label" required maxLength={120} placeholder={t("sd_what_ph")} className="input mt-1 w-full" /></label>
                <label className="text-xs text-subtle">{t("sd_collective")}
                  <select name="collectiu" defaultValue={signal.collectiuId ?? ""} className="input mt-1 w-full">
                    <option value="">{t("sd_all")}</option>
                    {collectius.map((c) => <option key={c.id} value={c.id}>{collectiveLabel(c.nom, lang)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-subtle">{t("sd_shift")}
                  <select name="torn" defaultValue={signal.tornId ?? ""} className="input mt-1 w-full">
                    <option value="">{t("sd_all")}</option>
                    {torns.map((tn) => <option key={tn.id} value={tn.id}>{shiftLabel(tn.nom, lang)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-subtle sm:col-span-2">{t("tb_domain")}
                  <select name="domini" defaultValue={signal.dominiId ?? ""} className="input mt-1 w-full">
                    <option value="">{t("sd_all")}</option>
                    {domains.map((d) => <option key={d.id} value={d.id}>{domainLabel(d.nom, lang)}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end"><button className="btn btn-primary">{t("sd_add_event")}</button></div>
            </form>
          </Card>

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
                        ? <>{rich(hrResultsDict[lang].sd_newres, { n: <span className="num">{f.newResults.n}</span> })}{f.newResults.mitjana !== null && rich(hrResultsDict[lang].sd_newres_avg, { v: <span className="num">{numD(f.newResults.mitjana, lang, 1)}</span> })}</>
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
