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

export const dynamic = "force-dynamic";

const MIN = 10;
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const num = (x: number) => x.toLocaleString("ca-ES");
const score10 = (x: number | null) => (x === null ? "Suprimit" : (x * 10).toFixed(1));

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> }) {
  const { id } = await params;
  const grain = (await searchParams).g === "day" ? "day" : "week";
  const d = Number.isInteger(Number(id)) ? hrPoolQuestion(Number(id), grain) : null;
  if (!d) notFound();
  const q = d.question;
  const st = STATE[q.state];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-3 text-sm"><Link href="/hr/pool">← Banc de preguntes</Link></p>
      <PageHeader
        title={q.text}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`badge ${st.cls}`}>{st.label}</span>
            <span className="badge">{questionTypeLabel(q.type)}</span>
            <span className="badge">{q.domain}</span>
            <span className="badge">{q.collective}</span>
            {q.facet && <span className="badge">{q.facet}</span>}
            {q.needId !== null && <span className="badge badge-accent">Necessitat {q.needId}</span>}
            {q.isFollowup && <span className="badge">Seguiment</span>}
            {q.aiGenerated && <span className="badge">IA</span>}
            <span className="text-xs text-subtle">{REASON[q.reason]}</span>
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <Stat label="Demanada" value={num(q.asked)} hint={`${q.asked7d} els últims 7 dies`} />
        <Stat label="Respostes" value={num(q.responses)} hint={`${q.responses7d} els últims 7 dies`} />
        <Stat label="Taxa de resposta" value={pct(q.answerRate)} hint={`${num(q.answeredAssigned)} de ${num(q.asked)} assignacions`} />
        <Stat label="Confiança" value={q.confidence === null ? "—" : Math.round(q.confidence)} hint={q.confidence === null ? (q.type === "open" || q.type === "ranking" ? "No aplica a aquest format" : `Suprimit (<${MIN} persones)`) : "Fiabilitat de la puntuació (0–100)"} />
        <Stat label="Consens" value={q.consensus === null ? "—" : Math.round(q.consensus)} hint={q.consensus === null ? undefined : "100 = tothom respon igual"} />
        <Stat label="Abast" value={`${num(q.reachedAccounts)} / ${num(q.eligibleAccounts)}`} hint="Persones que l'han respost" />
        <Stat label="Puntuació mitjana" value={q.avgScore === null ? "—" : `${score10(q.avgScore)} / 10`} hint={q.avgScore === null ? `Suprimit (<${MIN} respostes)` : "0 pitjor, 10 millor"} />
        <Stat
          label="Pròxim lot"
          value={q.nextBatchDay ?? "—"}
          hint={q.state === "live" && q.askedPerDay14 > 0 ? `~${q.askedPerDay14} assignacions/dia` : q.pendingAccounts !== null ? `${num(q.pendingAccounts)} pendents` : undefined}
        />
      </div>

      <Card
        title="Evolució"
        meta={
          <nav aria-label="Granularitat" className="hr-seg">
            <Link href={`/hr/pool/${q.id}`} aria-current={grain === "week" ? "page" : undefined}>Setmanes</Link>
            <Link href={`/hr/pool/${q.id}?g=day`} aria-current={grain === "day" ? "page" : undefined}>Dies</Link>
          </nav>
        }
        className="mb-6"
      >
        {d.weekly.length === 0 ? <Empty>Encara no hi ha activitat.</Empty> : <EvolutionChart buckets={d.weekly} grain={grain} />}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Distribució de les respostes" meta={d.distribution?.note}>
          {d.distribution ? (
            <Bars bars={d.distribution.bars} />
          ) : (
            <Empty>{q.type === "open" ? "Pregunta oberta: no hi ha distribució. Els comentaris es llegeixen agrupats per temes a Resultats." : `Suprimit: menys de ${MIN} respostes.`}</Empty>
          )}
        </Card>
        <Card title="Per període" flush>
          <table className="table">
            <thead><tr><th>Període</th><th className="text-right">Respostes</th><th className="text-right">Puntuació</th></tr></thead>
            <tbody>
              {d.periods.length === 0 && <tr><td colSpan={3} className="text-subtle">Sense respostes.</td></tr>}
              {d.periods.map((p) => (
                <tr key={p.periode}><td>{p.periode}</td><td className="num text-right">{num(p.responses)}</td><td className="num text-right">{score10(p.avgScore)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Per col·lectiu i torn" meta={`Els grups de menys de ${MIN} respostes tenen la puntuació suprimida`} className="mb-6" flush>
        <table className="table">
          <thead><tr><th>Col·lectiu</th><th>Torn</th><th className="text-right">Respostes</th><th className="text-right">Puntuació</th></tr></thead>
          <tbody>
            {d.segments.length === 0 && <tr><td colSpan={4} className="text-subtle">Sense respostes.</td></tr>}
            {d.segments.map((s, i) => (
              <tr key={i}><td>{s.collective}</td><td>{s.shift ?? "—"}</td><td className="num text-right">{num(s.responses)}</td><td className="num text-right">{score10(s.avgScore)}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Configuració">
          <Dl
            rows={[
              ["Format", `${questionTypeLabel(q.type)} (${q.type})`],
              ["Estat a la base de dades", q.dbStatus],
              ["Prioritat", String(q.priority)],
              ["Ordre dins la necessitat", String(q.order)],
              ["Polaritat", q.polarity === 1 ? "Positiva" : "Negativa (la puntuació s'inverteix)"],
              ["Faceta", q.facet ?? "—"],
              ["Origen", q.aiGenerated ? "Proposada per la IA" : "Escrita per una persona"],
              ["Motiu de la IA", q.aiReason ?? "—"],
              ["Aprovada per", q.approvedBy ? `${q.approvedBy}${q.approvedAt ? ` · ${q.approvedAt.slice(0, 16)}` : ""}` : "—"],
              ["Necessitat", q.needId === null ? "Monitoratge continu" : `${q.needTitle ?? ""} (${q.needStatus})`],
              ["Biaix après de l'ítem", d.itemBias ? `${d.itemBias.bias.toFixed(3)} (n=${d.itemBias.n})` : "—"],
            ]}
          />
          {q.options && (
            <div className="mt-4">
              <p className="label mb-1">Opcions</p>
              <ol className="list-decimal pl-5 text-[13px]">
                {q.options.map((o, i) => (
                  <li key={i}>
                    {o.label}
                    {typeof o.score === "number" && <span className="text-subtle"> · valor {o.score}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
        <Card title="Entrega">
          <Dl
            rows={[
              ["Primer lot", q.firstAskedDay ?? "—"],
              ["Última vegada demanada", q.lastAskedDay ?? "—"],
              ["Última resposta", q.lastAnsweredAt ? q.lastAnsweredAt.slice(0, 16) : "—"],
              ["Als lots d'avui", String(q.inTodayBatches)],
              ["Assignada com a", `monitoratge ${q.askedByReason.monitor} · necessitat ${q.askedByReason.need} · seguiment ${q.askedByReason.followup}`],
              ["Ritme (14 dies)", `${q.askedPerDay14} per dia`],
              ["Temps de resposta", q.avgAnswerMs === null ? "—" : `${(q.avgAnswerMs / 1000).toFixed(1)} s${q.carelessShare !== null ? ` · ${pct(q.carelessShare)} massa ràpides` : ""}`],
              ["Comentaris", q.comments === null ? "—" : String(q.comments)],
            ]}
          />
          {(q.dbStatus === "aprovada" || q.dbStatus === "retirada") && (
            <form action={setQuestionActiveAction} className="mt-4">
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="active" value={q.dbStatus === "retirada" ? "1" : "0"} />
              {q.dbStatus === "aprovada" ? (
                <ConfirmButton message="Retirar aquesta pregunta del banc? Deixarà de sortir als lots; l'historial es conserva." className="btn btn-ghost border border-line-strong px-3 py-1.5">
                  Retira del banc
                </ConfirmButton>
              ) : (
                <button type="submit" className="btn btn-ghost border border-line-strong px-3 py-1.5">Torna-la al banc</button>
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
