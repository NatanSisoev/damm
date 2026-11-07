// Insights-first blocks shared by the HR overview and results pages. Server components; all forms post to HR-only server actions.
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { ChangeBadge, Sparkline } from "./trend";
import { Card, Empty } from "./ui";
import { approveRecommendationAction, discardRecommendationAction, followUpAction, setAlarmStatusAction } from "./actions";
import type { Headline, Heatmap, HeatCell, NarrativeView, ReachGap, SegmentTrend, ThemesByDomain } from "./analytics";
import { segHref } from "./analytics";

const f1 = (v: number) => v.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${f1(Math.abs(v))}`;

// ---------- narrative ----------

export function NarrativeCard({ narrative, title = "Resum de l'anàlisi" }: { narrative: NarrativeView | null; title?: string }) {
  const d = narrative?.detail;
  return (
    <Card title={title} meta={narrative ? <span className="num">{narrative.periode}</span> : undefined}>
      {!d ? (
        <Empty>Encara no hi ha cap resum de l&apos;anàlisi. Es genera quan s&apos;executa l&apos;anàlisi i hi ha prou respostes (mínim {MIN_GROUP_SIZE}). <Link href="/hr/methodology" className="text-accent-ink hover:underline">Com es calcula?</Link></Empty>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] leading-relaxed">{d.summary}</p>
          {d.highlights.length > 0 && (
            <ul className="space-y-1.5 text-[13px] text-muted">
              {d.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-subtle">•</span>
                  <span>
                    {h.text} {h.domain && <span className="badge">{h.domain}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.suggestedActions.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Accions suggerides</div>
              <ul className="space-y-3">
                {d.suggestedActions.map((a, i) => (
                  <li key={i} className="rounded-lg border border-line p-3">
                    <div className="font-medium">{a.title}</div>
                    <p className="mt-0.5 text-[13px] text-muted">{a.why}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {a.recommendationId !== null ? (
                        <form action={followUpAction}>
                          <input type="hidden" name="id" value={a.recommendationId} />
                          <button className="btn btn-primary" type="submit">Crea una enquesta de seguiment</button>
                        </form>
                      ) : (
                        <Link href="/hr/needs" className="btn">Crea una enquesta de seguiment</Link>
                      )}
                      {a.alarmId !== null && <ReviewedButton alarmId={a.alarmId} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-subtle">Proposta de la IA · decideix una persona. Resum generat a partir d&apos;agregats; mai es mostren respostes individuals.</p>
        </div>
      )}
    </Card>
  );
}

export function ReviewedButton({ alarmId }: { alarmId: number }) {
  return (
    <form action={setAlarmStatusAction}>
      <input type="hidden" name="id" value={alarmId} />
      <input type="hidden" name="status" value="acknowledged" />
      <button className="btn" type="submit">Marca com a revisat</button>
    </form>
  );
}

// ---------- proposals ----------

export function ProposalsCard({ proposals }: { proposals: { id: number; text: string }[] }) {
  return (
    <Card title="Recomanacions proposades" meta={<span className="num">{proposals.length}</span>}>
      {proposals.length === 0 ? (
        <Empty>No hi ha cap recomanació pendent de decisió.</Empty>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {proposals.map((r) => (
            <li key={r.id} className="py-3">
              <div className="mb-1 text-xs font-medium text-subtle">Proposta de la IA · decideix una persona</div>
              <p className="text-[14px]">{r.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={discardRecommendationAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn" type="submit">Descarta</button>
                </form>
                <form action={approveRecommendationAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-primary" type="submit">Aprova</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- headlines ----------

const TONE_ICON: Record<Headline["tone"], string> = { up: "↑", down: "↓", warn: "!", neutral: "•" };
const TONE_CLS: Record<Headline["tone"], string> = { up: "text-good", down: "text-warn", warn: "text-warn", neutral: "text-subtle" };

export function HeadlineStrip({ headlines }: { headlines: Headline[] }) {
  return (
    <Card title="El que cal saber ara" meta="Cada frase indica la n i la confiança">
      {headlines.length === 0 ? (
        <Empty>Encara no hi ha prou respostes per destacar res (cal n ≥ {MIN_GROUP_SIZE}).</Empty>
      ) : (
        <ol className="-my-1 divide-y divide-line">
          {headlines.map((h) => (
            <li key={h.key} className="flex items-start gap-3 py-3">
              <span aria-hidden className={`mt-0.5 w-4 shrink-0 text-center font-semibold ${TONE_CLS[h.tone]}`}>{TONE_ICON[h.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">{h.text}</p>
                <p className="num mt-0.5 text-xs text-subtle">
                  n={h.n} <span className="font-sans">(n més petita)</span>
                  {h.confidence !== null && <> · confiança {Math.round(h.confidence)}%</>}
                  {" · "}
                  <Link href={h.href} className="text-accent-ink hover:underline">Veure detall →</Link>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------- heatmap ----------

function cellStyle(c: HeatCell, maxAbs: number): React.CSSProperties {
  if (c.suppressed || c.mean === null || c.delta === null) return {};
  const strength = Math.min(1, Math.abs(c.delta) / maxAbs);
  const pole = c.delta < 0 ? "var(--div-neg)" : "var(--div-pos)";
  // Colour = distance from the company average; opacity = how sure we are (n band).
  const opacity = c.precision === "sòlida" ? 1 : c.precision === "moderada" ? 0.8 : 0.58;
  return {
    background: `color-mix(in oklab, ${pole} ${Math.round(strength * 58)}%, var(--div-mid))`,
    opacity,
  };
}

const cellTitle = (c: HeatCell) =>
  c.suppressed
    ? `${c.collective} · ${c.domain}: suprimit (menys de ${MIN_GROUP_SIZE} persones han respost)`
    : c.mean === null
      ? `${c.collective} · ${c.domain}: sense dades`
      : `${c.collective} · ${c.domain}: ${f1(c.mean)}/5 · ${c.delta !== null ? `${signed(c.delta)} respecte de la mitjana de l'empresa` : ""} · n=${c.n} · precisió ${c.precision}`;

export function HeatmapCard({ map, selected }: { map: Heatmap; selected?: { seg?: string; dom?: string } }) {
  return (
    <Card
      title="Mapa de col·lectius i dominis"
      meta={map.periode ? <>Mitjana 1–5 · període <span className="num">{map.periode}</span></> : undefined}
    >
      {map.collectives.length === 0 ? (
        <Empty>Encara no hi ha dades.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="hr-heat hr-heat-grid w-full border-separate" style={{ borderSpacing: 3 }}>
              <caption className="sr-only">Mitjana per col·lectiu i domini. El color indica la diferència amb la mitjana de l&apos;empresa.</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-24 text-left text-xs font-medium text-subtle">Col·lectiu</th>
                  {map.domains.map((d) => (
                    <th key={d} scope="col" className="px-1 text-center text-[11px] leading-tight font-medium text-subtle">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {map.collectives.map((col, ci) => (
                  <tr key={col}>
                    <th scope="row" className="pr-2 text-left text-[13px] font-medium">{col}</th>
                    {map.cells[ci].map((c) => {
                      const on = selected?.seg === c.collective && selected?.dom === c.domain;
                      return (
                        <td key={c.domain} className="p-0">
                          <Link
                            href={segHref(c.collective, c.domain)}
                            scroll={false}
                            title={cellTitle(c)}
                            aria-label={cellTitle(c)}
                            aria-current={on ? "true" : undefined}
                            className={`hr-heat-cell ${c.suppressed ? "hr-heat-hatch" : ""} ${on ? "hr-heat-on" : ""}`}
                            style={cellStyle(c, map.maxAbs)}
                          >
                            {c.suppressed ? <span className="sr-only">Suprimit</span> : c.mean === null ? "—" : <span className="num">{f1(c.mean)}</span>}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pr-2 pt-1 text-left text-xs font-medium text-subtle">Empresa</th>
                  {map.company.map((v, i) => (
                    <td key={i} className="num pt-1 text-center text-xs text-subtle">{v === null ? "—" : f1(v)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-subtle">
            <span className="flex items-center gap-2">
              Per sota
              <span aria-hidden className="hr-heat-scale" />
              Per sobre de la mitjana de l&apos;empresa
            </span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="hr-heat-key hr-heat-hatch" /> Suprimit (n &lt; {MIN_GROUP_SIZE})</span>
            <span>Color més pàl·lid = menys confiança (n baixa)</span>
          </div>
        </>
      )}
    </Card>
  );
}

export function SegmentTrendCard({ trend }: { trend: SegmentTrend }) {
  if (!trend) return null;
  const means = trend.cells.map((c) => c.mitjana);
  return (
    <section id="tendencia" className="card scroll-mt-20">
      <div className="card-header">
        <h2 className="section-title">
          {trend.domain} · {trend.scope === "Tots" ? "tota l'empresa" : trend.scope}
        </h2>
        <Link href="/hr/results" scroll={false} className="text-xs text-accent-ink hover:underline">Tanca</Link>
      </div>
      <div className="card-body flex flex-wrap items-center gap-x-8 gap-y-3">
        <Sparkline values={means} />
        <ol className="flex flex-wrap gap-x-6 gap-y-2">
          {trend.periodes.map((p, i) => {
            const c = trend.cells[i];
            return (
              <li key={p}>
                <div className="num text-xs text-subtle">{p}</div>
                <div className="num font-semibold">
                  {c?.suprimit ? "Suprimit" : c?.mitjana == null ? "—" : f1(c.mitjana)}
                  {c && !c.suprimit && c.n !== null && <span className="ml-1 text-xs font-normal text-subtle">n={c.n}</span>}
                </div>
              </li>
            );
          })}
        </ol>
        <ChangeBadge canvi={trend.canvi} />
      </div>
    </section>
  );
}

// ---------- themes ----------

function ShareSpark({ shares }: { shares: (number | null)[] }) {
  const max = Math.max(0.05, ...shares.map((s) => s ?? 0));
  const w = 56, h = 20;
  const pts = shares.map((s, i) => (s === null ? null : { x: (i / Math.max(1, shares.length - 1)) * (w - 6) + 3, y: h - 3 - (s / max) * (h - 6) })).filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label="Pes del tema per període" className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-chart-1" />)}
    </svg>
  );
}

export function ThemesCard({ groups }: { groups: ThemesByDomain }) {
  return (
    <Card title="Què diuen els comentaris" meta="Temes al costat del domini que expliquen">
      {groups.length === 0 ? (
        <Empty>Encara no hi ha temes: cal que {MIN_GROUP_SIZE} comentaris o més parlin del mateix. <Link href="/hr/methodology" className="text-accent-ink hover:underline">Com es calcula?</Link></Empty>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.domain ?? "altres"}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{g.domain ?? "Sense domini clar"}</h3>
              <ul className="divide-y divide-line">
                {g.themes.map((t) => (
                  <li key={t.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.label}</span>
                        {t.isNew && <span className="badge badge-accent">nou</span>}
                        {t.weak && <span className="badge badge-warn">senyal feble</span>}
                      </div>
                      {t.summary && <p className="mt-1 text-[13px] text-muted">«{t.summary}»</p>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-subtle">
                      <ShareSpark shares={t.shares} />
                      <span className="num">{t.latestN} comentaris</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- who to reach ----------

export function ReachCard({ gaps }: { gaps: ReachGap[] }) {
  return (
    <Card title="A qui cal arribar" meta={<Link href="/hr/methodology" className="underline">Com es calcula?</Link>}>
      {gaps.length === 0 ? (
        <Empty>Cap grup està clarament infrarepresentat.</Empty>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {gaps.map((g) => (
            <li key={g.key} className="py-3">
              <p className="text-[14px]">{g.text}</p>
              <p className="mt-1 text-[13px] text-muted">{g.action}</p>
              <Link href="/hr/needs?nova=1#nova" className="btn mt-2 inline-flex" aria-label={`Crea una enquesta de seguiment per a: ${g.text}`}>Crea una enquesta de seguiment</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
