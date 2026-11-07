import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { CHANGE_MIN_DELTA, CHANGE_MIN_N, getSignalDetail, type Change, type SignalTimelineStep } from "@damm/db/hr";
import { Card, Empty, PageHeader, SuppressedBadge } from "../../ui";
import { setSignalStatusAction } from "../../actions";
import { approveFromSignalAction, discardFromSignalAction, followUpFromSignalAction } from "./actions";

import { STATUS_LABELS, STATUS_ORDER, SignalBadges, signalTypeLabel } from "../../signal-labels";
const ESTAT: Record<string, string> = { proposada: "", aprovada: "badge-good", descartada: "" };
const suppressedHint = `Menys de ${MIN_GROUP_SIZE} respondents`;

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
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChangeBadge({ canvi }: { canvi: Change }) {
  if (canvi.label === "sense canvi clar") {
    return (
      <span className="badge" title={`Només es parla de canvi si |Δ| ≥ ${CHANGE_MIN_DELTA} i els dos períodes tenen n ≥ ${CHANGE_MIN_N}`}>
        sense canvi clar
      </span>
    );
  }
  const up = canvi.label === "puja";
  return (
    <span className="badge num">
      {up ? "↑ puja" : "↓ baixa"} {canvi.delta! >= 0 ? "+" : "−"}{Math.abs(canvi.delta!).toFixed(1)}
    </span>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 80, h = 24;
  const pts = values
    .map((v, i) => (v === null ? null : { x: (i / Math.max(1, values.length - 1)) * (w - 8) + 4, y: h - 4 - ((v - 1) / 4) * (h - 8) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label="Tendència" className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-chart-1" />)}
    </svg>
  );
}

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = Number.isInteger(Number(id)) ? getSignalDetail(Number(id)) : null;
  if (!detail) notFound();
  const { signal, periodes, trend, themes, hiddenThemes, recommendations, followUps, timeline } = detail;

  return (
    <>
      <PageHeader
        title={signalTypeLabel(signal.tipus)}
        subtitle={signal.descripcio}
        actions={<Link href="/hr/recommendations" className="btn">← Senyals i recomanacions</Link>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SignalBadges tipus={signal.tipus} severity={signal.severity} status={signal.status} />
        <span className="badge">{signal.collectiu ?? "Tots els col·lectius"}</span>
        <span className="badge num">{signal.periode}</span>
        <span className="badge num">n={signal.n}</span>
        {signal.confianca !== null && <span className="badge num">confiança {Math.round(signal.confianca * 100)}%</span>}
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
            title="Tendència per domini"
            meta={signal.collectiu ?? "Tots"}
            flush
          >
            {trend.length === 0 ? (
              <div className="px-5 pb-5"><Empty>Encara no hi ha agregats per a aquest col·lectiu.</Empty></div>
            ) : (
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
                              {c.mitjana.toFixed(1)}
                              <div className={`text-[11px] whitespace-nowrap ${c.precisio === "indicativa" ? "text-warn" : "text-subtle"}`}>n={c.n} · {c.precisio}</div>
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
            )}
          </Card>

          <Card title="Temes relacionats" meta={`n ≥ ${MIN_GROUP_SIZE}`}>
            {themes.length === 0 ? (
              <Empty>Cap tema amb prou comentaris ({`n ≥ ${MIN_GROUP_SIZE}`}) per a aquest col·lectiu.</Empty>
            ) : (
              <ul className="space-y-4">
                {themes.map((t) => (
                  <li key={t.id} className="rounded-lg border border-line p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{t.etiqueta}</h3>
                      {t.emergent && <span className="badge badge-warn">Emergent</span>}
                      <span className="num ml-auto text-xs text-subtle">n={t.n} comentaris</span>
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
          <Card title="Recomanacions" meta={<span className="num">{recommendations.length}</span>}>
            {recommendations.length === 0 ? (
              <Empty>Encara no hi ha recomanacions per a aquest senyal.</Empty>
            ) : (
              <ul className="space-y-3">
                {recommendations.map((r) => (
                  <li key={r.id} className={`rounded-lg border border-line p-4 ${r.estat === "descartada" ? "opacity-60" : ""}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`badge ${ESTAT[r.estat] ?? ""}`}>{r.estat}</span>
                      {r.seguimentNecessitatId && <span className="badge badge-accent">Seguiment creat</span>}
                    </div>
                    <p>{r.text}</p>
                    {(r.estat === "proposada" || (r.estat === "aprovada" && !r.seguimentNecessitatId)) && (
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                        {r.estat === "proposada" && (
                          <>
                            <form action={discardFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn">Descartar</button></form>
                            <form action={approveFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">Aprovar</button></form>
                          </>
                        )}
                        {r.estat === "aprovada" && !r.seguimentNecessitatId && (
                          <form action={followUpFromSignalAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="signal" value={signal.id} /><button className="btn btn-primary">Crear enquesta de seguiment</button></form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Seguiment">
            {followUps.length === 0 ? (
              <Empty>Encara no hi ha cap enquesta de seguiment. Apareixerà quan s&apos;aprovi una recomanació i es creï.</Empty>
            ) : (
              <ul className="space-y-4">
                {followUps.map((f) => (
                  <li key={f.necessitatId} className="rounded-lg border border-line p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${f.published ? "badge-good" : "badge-warn"}`}>{f.published ? "Publicada" : "Sense publicar"}</span>
                      <Link href="/hr/review" className="ml-auto text-xs text-accent-ink hover:underline">Revisar i publicar →</Link>
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
                        ? <>Nous resultats: <span className="num">n={f.newResults.n}</span>{f.newResults.mitjana !== null && <> · mitjana <span className="num">{f.newResults.mitjana.toFixed(1)}</span></>}</>
                        : `Nous resultats: pendents (cal n ≥ ${MIN_GROUP_SIZE}).`}
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
