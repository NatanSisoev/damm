import Link from "next/link";
import { Comments, MinPeople, People, PeopleRange } from "../../glyphs";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getSignalDetail, listCollectius, listContextEvents, listDomains, listTorns, type SignalTimelineStep } from "@damm/db/hr";
import { hrInsights, hrListProbes, type ProbeView } from "@/lib/hr-engine";
import { Card, Empty, PageHeader, SuppressedBadge } from "../../ui";
import { setSignalStatusAction } from "../../actions";
import "../alarms.css";
import { generateRecommendationsAction } from "../actions";
import { GenerateButton } from "../generate-button";
import { addContextEventAction, approveFromSignalAction, discardFromSignalAction, followUpFromSignalAction, startProbeAction, stopProbeAction } from "./actions";

import { recommendationStatus } from "../../labels";
import { RecommendationBody } from "../../recommendation-card";
import { ChangeBadge, Sparkline } from "../../trend";
import { TrendChart } from "../../trend-chart";
import { STATUS_LABELS, STATUS_ORDER, SignalBadges } from "../../signal-labels";
import { signalDetail, signalHeadline } from "@/lib/signal-text";
const suppressedHint = `Menys de ${MIN_GROUP_SIZE} persones han respost`;

const NEXT: Partial<Record<SignalTimelineStep["key"], { href: string; label: string }>> = {
  recomanacio: { href: "#recomanacions", label: "Decideix la recomanació" },
  seguiment: { href: "#seguiment", label: "Crea l'enquesta de seguiment" },
  resultats: { href: "#seguiment", label: "Mira el seguiment" },
};

function Timeline({ steps }: { steps: SignalTimelineStep[] }) {
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
              {s.state === "done" ? "Fet" : "Pendent"} · {s.detail}
            </div>
            {s.state !== "done" && NEXT[s.key] && (
              <Link href={NEXT[s.key]!.href} className="mt-1 inline-block text-xs text-accent-ink hover:underline">{NEXT[s.key]!.label} →</Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v <= 1 ? v * 100 : v)}%`;

function ProbeCard({ probes, signal, error }: { probes: ProbeView[]; signal: { id: number; collectiuId: number | null; tornId: number | null; dominiId: number | null; collectiu: string | null; domini: string | null }; error?: string }) {
  const active = probes.filter((p) => p.status === "active");
  const canProbe = signal.collectiuId !== null && signal.dominiId !== null;
  return (
    <Card id="indagar" title="Indagar" meta="Més mostreig durant un temps">
      <p className="mb-3 text-[13px] text-muted">
        Fa que {signal.domini ?? "aquest domini"} surti més sovint a les enquestes d&apos;aquest grup (x2 durant 14 dies). Només afecta quines preguntes es proposen, mai qui les contesta.
      </p>
      {error && <p role="alert" className="mb-3 rounded-lg border border-line-strong px-3 py-2 text-[13px]">{error}</p>}
      {active.length === 0 && (
        <form action={startProbeAction}>
          <input type="hidden" name="signal" value={signal.id} />
          <input type="hidden" name="collectiu" value={signal.collectiuId ?? ""} />
          <input type="hidden" name="torn" value={signal.tornId ?? ""} />
          <input type="hidden" name="domini" value={signal.dominiId ?? ""} />
          <button className="btn btn-primary" disabled={!canProbe}>Indaga</button>
          {!canProbe && <span className="ml-3 text-xs text-subtle">Cal un senyal amb col·lectiu i domini concrets.</span>}
        </form>
      )}
      {probes.length > 0 && (
        <ul className={`${active.length === 0 ? "mt-4" : ""} space-y-3`}>
          {probes.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`badge ${p.status === "active" ? "badge-accent" : ""}`}>{p.status === "active" ? "Activa" : p.status === "stopped" ? "Aturada" : "Acabada"}</span>
                <span className="num text-xs text-subtle">x{p.boost} · {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}</span>
                {p.status === "active" && <span className="num ml-auto text-xs">{p.daysLeft} {p.daysLeft === 1 ? "dia" : "dies"} restants</span>}
              </div>
              {!p.progress || p.progress.suppressed ? (
                <p className="text-[13px] text-subtle">Encara no hi ha prou respostes (cal <MinPeople />).</p>
              ) : (
                <p className="text-[13px]">
                  <span className="num">{p.progress.extraAnswers !== null ? `+${p.progress.extraAnswers}` : "–"}</span> respostes extra
                  {p.progress.confidenceBefore !== null && p.progress.confidenceNow !== null && (
                    <> · confiança <span className="num">{pct(p.progress.confidenceBefore)} → {pct(p.progress.confidenceNow)}</span></>
                  )}
                </p>
              )}
              {p.status === "active" && (
                <form action={stopProbeAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="signal" value={signal.id} />
                  <button className="btn">Atura</button>
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
  const { probeError, eventError } = await searchParams;
  const detail = Number.isInteger(Number(id)) ? getSignalDetail(Number(id)) : null;
  if (!detail) notFound();
  const { signal, periodes, trend, trendScope, themes, hiddenThemes, recommendations, followUps, timeline } = detail;
  const probes = hrListProbes(signal.id);
  const sameSegment = (c: number | null, t: number | null, d: number | null) =>
    (c === null || c === signal.collectiuId) && (t === null || signal.tornId === null || t === signal.tornId) && (d === null || d === signal.dominiId);
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
        title={signalHeadline(signal)}
        subtitle={signalDetail(signal)}
        actions={<Link href="/hr/signals" className="btn">← Alarmes</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SignalBadges tipus={signal.tipus} severity={signal.severity} status={signal.status} />
        <span className="badge num">{signal.periode}</span>
        <span className="badge num"><People n={signal.n} /></span>
        {signal.confianca !== null && <span className="badge num">confiança {Math.round(signal.confianca <= 1 ? signal.confianca * 100 : signal.confianca)}%</span>}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-subtle">Estat del senyal:</span>
        {STATUS_ORDER.map((st) => (
          <form key={st} action={setSignalStatusAction}>
            <input type="hidden" name="id" value={signal.id} />
            <input type="hidden" name="status" value={st} />
            <button className={`btn ${signal.status === st ? "btn-primary" : ""}`} disabled={signal.status === st} aria-pressed={signal.status === st}>
              {STATUS_LABELS[st]}
            </button>
          </form>
        ))}
      </div>

      <Card title="Del senyal a l'acció" className="mb-6">
        <Timeline steps={timeline} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card
            title={`Evolució per domini · ${trendScope} (0-10)`}
            meta="Puntuació 0-10"
            flush
          >
            {trend.length === 0 ? (
              <div className="px-5 pb-5"><Empty>Encara no hi ha agregats per a aquest col·lectiu.</Empty></div>
            ) : (
              <>
                <TrendChart periodes={periodes} rows={trend} highlight={trend.filter((r) => r.related).map((r) => r.domini)} scale="0-10" />
                <details className="border-t border-line">
                  <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-subtle">Veure taula</summary>
                  <div className="overflow-x-auto">
                <table className="table min-w-[32rem]">
                    <thead>
                      <tr>
                        <th>Domini</th>
                        {periodes.map((p) => <th key={p} className="text-right">{p}</th>)}
                        <th className="text-right">Canvi</th>
                        <th className="text-right">Tendència</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((r) => (
                        <tr key={r.domini} className={r.related ? "bg-accent-soft" : ""}>
                          <td className="font-medium">
                            {r.domini}
                            {r.related && <span className="badge badge-accent ml-2">Relacionat</span>}
                          </td>
                          {r.cells.map((c) => (
                            <td key={c.periode} className="num text-right">
                              {c.suprimit ? (
                                <SuppressedBadge title={suppressedHint} />
                              ) : c.mitjana === null ? (
                                <span className="text-subtle">–</span>
                              ) : (
                                <>
                                  {((c.mitjana - 1) * 2.5).toFixed(1)}
                                  <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}><People n={c.n} /> · {c.precisio}</div>
                                  {c.sd !== null && c.consensus !== null && (
                                    <div className="text-[11px] whitespace-nowrap text-subtle">±{(c.sd * 2.5).toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · consens {Math.round(c.consensus)}%</div>
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

          <Card title="Temes relacionats" meta={`👤≥${MIN_GROUP_SIZE}`}>
            {themes.length === 0 ? (
              <Empty>Cap tema amb prou comentaris ({`👤≥${MIN_GROUP_SIZE}`}) per a aquest col·lectiu.</Empty>
            ) : (
              <ul className="space-y-4">
                {themes.map((t) => (
                  <li key={t.id} className="rounded-lg border border-line p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{t.etiqueta}</h3>
                      {t.emergent && <span className="badge badge-warn">Emergent</span>}
                      <span className="num ml-auto text-xs text-subtle"><Comments n={t.n} /></span>
                    </div>
                    {t.resum && <p className="text-[13px] text-muted">{t.resum} <span className="text-xs text-subtle">(resum generat per la IA)</span></p>}
                    {t.snippets.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {t.snippets.map((s, i) => (
                          <li key={i} className="border-l-2 border-line-strong pl-3 text-[13px] italic text-muted">«{s}»</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-subtle">
              Només es mostren temes amb {MIN_GROUP_SIZE} comentaris o més en aquest col·lectiu. Els fragments són anonimitzats i il·lustratius, no respostes individuals.
              {hiddenThemes > 0 && ` ${hiddenThemes} ${hiddenThemes > 1 ? "temes ocults" : "tema ocult"} per tenir menys de ${MIN_GROUP_SIZE} comentaris.`}
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card id="recomanacions" title="Recomanacions" meta={<span className="num">{recommendations.length}</span>}>
            {recommendations.length === 0 ? (
              signal.dominiId != null ? (
                <div className="gen-panel">
                  <span className="gen-panel-mark" aria-hidden>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" /></svg>
                  </span>
                  <h3>Encara no hi ha cap recomanació</h3>
                  <p>Proposa fins a 3 accions concretes per a aquest senyal, amb responsable i termini suggerits.</p>
                  <form action={generateRecommendationsAction}>
                    <input type="hidden" name="signal" value={signal.id} />
                    <GenerateButton variant="panel" />
                  </form>
                  <small>Una persona les aprova o les descarta.</small>
                </div>
              ) : (
                <Empty>Aquest senyal no té un domini concret, així que no es poden proposar recomanacions.</Empty>
              )
            ) : (
              <ul className="space-y-3">
                {recommendations.map((r) => (
                  <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`badge ${recommendationStatus(r.estat).cls}`}>{recommendationStatus(r.estat).label}</span>
                      {r.seguimentNecessitatId && <span className="badge badge-accent">Seguiment creat</span>}
                    </div>
                    <RecommendationBody r={r} />
                    <Link href={`/hr/recommendations/${r.id}`} className="mt-3 inline-block text-xs text-accent-ink hover:underline">Veure tot el detall →</Link>
                    {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                        {r.estat === "proposada" && (
                          <>
                            <form action={discardFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn">Descarta</button></form>
                            <form action={approveFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">Aprova</button></form>
                          </>
                        )}
                        {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                          <form action={followUpFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">Crea l&apos;enquesta de seguiment</button></form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ProbeCard probes={probes} signal={signal} error={probeError} />

          <Card id="context" title="Des de quan ha canviat?" meta="Context, no causa">
            {effects.length === 0 ? (
              <Empty>Encara no hi ha cap comparació «des de». Apareix quan hi ha prou respostes abans i després d&apos;una recomanació aprovada o d&apos;un fet del context.</Empty>
            ) : (
              <ul className="space-y-3">
                {effects.map((i) => {
                  const d = i.detail!;
                  return (
                    <li key={i.id} className="rounded-lg border border-line p-4">
                      <div className="mb-1 text-xs font-medium text-subtle">Des de {d.since} · {d.anchor.label}</div>
                      <p className="text-[13px]">{d.wording}</p>
                      <p className="mt-1 text-xs text-subtle">
                        <span className="num">{f1(d.before.score)} → {f1(d.after.score)}</span> · <PeopleRange from={d.before.n} to={d.after.n} />
                      </p>
                      <p className="mt-1 text-xs text-subtle">{d.limits}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            <h3 className="mt-5 mb-2 text-[13px] font-medium">Fets del context</h3>
            {events.length === 0 ? (
              <p className="text-xs text-subtle">Cap fet registrat per a aquest grup.</p>
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
                <label className="text-xs text-subtle">Data<input type="date" name="date" required className="input mt-1 w-full" /></label>
                <label className="text-xs text-subtle">Què ha passat<input type="text" name="label" required maxLength={120} placeholder="Nou sistema de torns" className="input mt-1 w-full" /></label>
                <label className="text-xs text-subtle">Col·lectiu
                  <select name="collectiu" defaultValue={signal.collectiuId ?? ""} className="input mt-1 w-full">
                    <option value="">Tots</option>
                    {collectius.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </label>
                <label className="text-xs text-subtle">Torn
                  <select name="torn" defaultValue={signal.tornId ?? ""} className="input mt-1 w-full">
                    <option value="">Tots</option>
                    {torns.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </label>
                <label className="text-xs text-subtle sm:col-span-2">Domini
                  <select name="domini" defaultValue={signal.dominiId ?? ""} className="input mt-1 w-full">
                    <option value="">Tots</option>
                    {domains.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end"><button className="btn btn-primary">Afegeix el fet</button></div>
            </form>
          </Card>

          <Card id="seguiment" title="Seguiment">
            {followUps.length === 0 ? (
              <Empty>Encara no hi ha cap enquesta de seguiment. Apareixerà quan s&apos;aprovi una recomanació i es creï.</Empty>
            ) : (
              <ul className="space-y-4">
                {followUps.map((f) => (
                  <li key={f.necessitatId} className="rounded-lg border border-line p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${f.published ? "badge-good" : "badge-warn"}`}>{f.published ? "Publicada" : "Sense publicar"}</span>
                      <Link href="/hr/needs" className="ml-auto text-xs text-accent-ink hover:underline">Revisa i publica →</Link>
                    </div>
                    <p className="text-[13px] font-medium">{f.textNl}</p>
                    {f.questions.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
                        {f.questions.map((q) => (
                          <li key={q.id}>{q.text} <span className="text-xs text-subtle">({q.estat === "aprovada" ? "aprovada" : "esborrany"})</span></li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-subtle">Encara no hi ha preguntes redactades.</p>
                    )}
                    <p className="mt-3 text-xs text-subtle">
                      {f.newResults
                        ? <>Nous resultats: <span className="num"><People n={f.newResults.n} /></span>{f.newResults.mitjana !== null && <> · mitjana <span className="num">{f.newResults.mitjana.toFixed(1)}</span></>}</>
                        : `Nous resultats: pendents (cal 👤≥${MIN_GROUP_SIZE}).`}
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
