import Link from "next/link";
import { Comments, People, PeopleRange } from "../../glyphs";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getRecommendationDetail } from "@damm/db/hr";
import { hrInsights } from "@/lib/hr-engine";
import { signalDetail, signalHeadline } from "@/lib/signal-text";
import { Card, Empty, PageHeader } from "../../ui";
import { recommendationStatus } from "../../labels";
import { SignalBadges } from "../../signal-labels";
import { TrendChart } from "../../trend-chart";
import { approveFromDetailAction, discardFromDetailAction, followUpFromDetailAction } from "../actions";

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  const detail = Number.isInteger(Number(id)) ? getRecommendationDetail(Number(id)) : null;
  if (!detail) notFound();
  const { recommendation: r, signal: sd, siblings, followUp } = detail;
  const status = recommendationStatus(r.estat);
  const signal = sd?.signal ?? null;

  // "Since" comparisons for this segment, once the recommendation is adopted. Correlation, never proof.
  const sameSegment = (c: number | null, t: number | null, d: number | null) =>
    !!signal && (c === null || c === signal.collectiuId) && (t === null || signal.tornId === null || t === signal.tornId) && (d === null || d === signal.dominiId);
  const effects = r.estat === "aprovada" && signal
    ? hrInsights({ role: "hr" }, { periode: "all", kind: "action_effect", collectiuId: signal.collectiuId ?? undefined })
        .filter((i): i is Extract<typeof i, { kind: "action_effect" }> => i.kind === "action_effect" && !i.suppressed && !!i.detail && sameSegment(i.collectiuId, i.tornId, i.domainId))
    : [];

  const steps = [
    { label: "Proposada", detail: `${day(r.creat)}${r.font ? ` · ${r.font === "llm" ? "redactada per la IA" : "plantilla"}` : ""}`, done: true },
    { label: "Decisió", detail: r.estat === "aprovada" ? `Aprovada el ${r.aprovadaEl ? day(r.aprovadaEl) : "?"}` : r.estat === "descartada" ? "Descartada" : "Pendent", done: r.estat !== "proposada" },
    { label: "Enquesta de seguiment", detail: followUp ? (followUp.published ? "Publicada" : "Creada, sense publicar") : r.seguimentNecessitatId ? "Creada" : "Per crear", done: !!r.seguimentNecessitatId },
    { label: "Nous resultats", detail: followUp?.newResults ? "Disponibles" : `Cal 👤≥${MIN_GROUP_SIZE}`, done: !!followUp?.newResults },
  ];

  return (
    <>
      <PageHeader
        title={r.titol ?? `Recomanació ${r.id}`}
        subtitle={r.titol ? r.text : undefined}
        actions={<Link href="/hr/recommendations" className="btn">← Recomanacions</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={`badge ${status.cls}`}>{status.label}</span>
        {r.seguimentNecessitatId && <span className="badge badge-accent">Seguiment creat</span>}
        {signal && <span className="badge num">{signal.collectiu ?? "Tots"}{signal.domini ? ` · ${signal.domini}` : ""}</span>}
        <span className="badge num">#{r.id}</span>
      </div>

      <Card title="De la proposta a l'acció" className="mb-6">
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
          <Card title="La proposta">
            <p className="text-[15px]">{r.text}</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {r.iniciativa && <Fact label="Iniciativa de Damm">{r.iniciativa}</Fact>}
              {r.responsableSuggerit && <Fact label="Responsable suggerit">{r.responsableSuggerit}</Fact>}
              {r.terminiSuggerit && <Fact label="Termini suggerit">{r.terminiSuggerit}</Fact>}
              <Fact label="Origen">{r.font === "llm" ? "Redactada per la IA" : r.font === "template" ? "Redactada a partir d'una plantilla" : "Sense informació"}</Fact>
            </dl>
            {r.justificacio && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-xs font-medium text-subtle">Per què</h3>
                <p className="mt-1 text-[13px] text-muted">{r.justificacio}</p>
              </div>
            )}
            {r.limits && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="text-xs font-medium text-subtle">Límits</h3>
                <p className="mt-1 text-[13px] text-muted">{r.limits}</p>
              </div>
            )}
            <p className="mt-4 text-xs text-subtle">La IA proposa, una persona decideix. Els responsables i terminis són suggeriments: no se&apos;n fa seguiment.</p>
            {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                {r.estat === "proposada" && (
                  <>
                    <form action={discardFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn">Descarta</button></form>
                    <form action={approveFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Aprova</button></form>
                  </>
                )}
                {r.estat === "aprovada" && (
                  <form action={followUpFromDetailAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-primary">Crea l&apos;enquesta de seguiment</button></form>
                )}
              </div>
            )}
          </Card>

          {sd && signal && (
            <Card title={`Evolució per domini · ${sd.trendScope} (0-10)`} meta="Puntuació 0-10" flush>
              {sd.trend.length === 0 ? (
                <div className="px-5 pb-5"><Empty>Encara no hi ha agregats per a aquest col·lectiu.</Empty></div>
              ) : (
                <TrendChart periodes={sd.periodes} rows={sd.trend} highlight={sd.trend.filter((t) => t.related).map((t) => t.domini)} scale="0-10" />
              )}
            </Card>
          )}

          {sd && (
            <Card title="Temes relacionats" meta={`👤≥${MIN_GROUP_SIZE}`}>
              {sd.themes.length === 0 ? (
                <Empty>Cap tema amb prou comentaris per a aquest col·lectiu.</Empty>
              ) : (
                <ul className="space-y-4">
                  {sd.themes.map((t) => (
                    <li key={t.id} className="rounded-lg border border-line p-4">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{t.etiqueta}</h3>
                        {t.emergent && <span className="badge badge-warn">Emergent</span>}
                        <span className="num ml-auto text-xs text-subtle"><Comments n={t.n} /></span>
                      </div>
                      {t.resum && <p className="text-[13px] text-muted">{t.resum}</p>}
                      {t.snippets.map((s, i) => (
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
          <Card title="Alarma d'origen">
            {signal ? (
              <>
                <h3 className="font-medium">{signalHeadline(signal)}</h3>
                <p className="mt-1 text-[13px] text-muted">{signalDetail(signal)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SignalBadges tipus={signal.tipus} severity={signal.severity} status={signal.status} />
                  <span className="badge num">{signal.periode}</span>
                  <span className="badge num"><People n={signal.n} /></span>
                  {signal.confianca !== null && <span className="badge num">confiança {Math.round(signal.confianca <= 1 ? signal.confianca * 100 : signal.confianca)}%</span>}
                </div>
                <Link href={`/hr/signals/${signal.id}`} className="mt-3 inline-block text-xs text-accent-ink hover:underline">Obre l&apos;alarma →</Link>
              </>
            ) : (
              <Empty>Aquesta recomanació no té cap alarma visible associada.</Empty>
            )}
          </Card>

          <Card title="Des de quan ha canviat?" meta="Context, no causa">
            {r.estat !== "aprovada" ? (
              <Empty>La comparació «des de» apareix quan la recomanació s&apos;aprova i hi ha prou respostes abans i després.</Empty>
            ) : effects.length === 0 ? (
              <Empty>Encara no hi ha prou respostes després del {r.aprovadaEl ? day(r.aprovadaEl) : "moment de l'aprovació"}.</Empty>
            ) : (
              <ul className="space-y-3">
                {effects.map((i) => {
                  const d = i.detail!;
                  return (
                    <li key={i.id} className="rounded-lg border border-line p-4">
                      <div className="mb-1 text-xs font-medium text-subtle">Des de {d.since} · {d.anchor.label}</div>
                      <p className="text-[13px]">{d.wording}</p>
                      <p className="mt-1 text-xs text-subtle"><span className="num">{f1(d.before.score)} → {f1(d.after.score)}</span> · <PeopleRange from={d.before.n} to={d.after.n} /></p>
                      <p className="mt-1 text-xs text-subtle">{d.limits}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Enquesta de seguiment">
            {!r.seguimentNecessitatId || !followUp ? (
              <Empty>Encara no hi ha cap enquesta de seguiment. Es crea quan s&apos;aprova la recomanació.</Empty>
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${followUp.published ? "badge-good" : "badge-warn"}`}>{followUp.published ? "Publicada" : "Sense publicar"}</span>
                  <Link href="/hr/needs" className="ml-auto text-xs text-accent-ink hover:underline">Revisa i publica →</Link>
                </div>
                <p className="text-[13px] font-medium">{followUp.textNl}</p>
                {followUp.questions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
                    {followUp.questions.map((q) => (
                      <li key={q.id}>{q.text} <span className="text-xs text-subtle">({q.estat === "aprovada" ? "aprovada" : "esborrany"})</span></li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-subtle">
                  {followUp.newResults
                    ? <>Nous resultats: <span className="num"><People n={followUp.newResults.n} /></span>{followUp.newResults.mitjana !== null && <> · mitjana <span className="num">{followUp.newResults.mitjana.toFixed(1)}</span></>}</>
                    : `Nous resultats: pendents (cal 👤≥${MIN_GROUP_SIZE}).`}
                </p>
              </div>
            )}
          </Card>

          {siblings.length > 0 && (
            <Card title="Altres recomanacions de l'alarma" meta={<span className="num">{siblings.length}</span>}>
              <ul className="space-y-2">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/hr/recommendations/${s.id}`} className="block rounded-lg border border-line p-3 hover:bg-surface-muted">
                      <span className={`badge ${recommendationStatus(s.estat).cls}`}>{recommendationStatus(s.estat).label}</span>
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
