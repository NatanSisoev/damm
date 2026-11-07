import type { ReactNode } from "react";
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listCollectius, listDomains, listNeedCards, listNeedDrafts, type NeedCard, type NeedState } from "@damm/db/hr";
import { ConfirmButton } from "../confirm-button";
import { closeNeedAction, publishAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { NEED_STATUS, questionTypeLabel } from "../labels";
import { DraftReview } from "./draft-review";
import { NeedForm } from "./need-form";

export const dynamic = "force-dynamic";

const STATES: { key: NeedState; label: string; hint: string }[] = [
  { key: "esborrany", label: NEED_STATUS.esborrany.label, hint: "La IA ha proposat preguntes; falta que una persona les revisi i les aprovi." },
  { key: "llesta", label: NEED_STATUS.llesta.label, hint: "Totes les preguntes estan revisades. Falta publicar-la: les preguntes entren al banc de preguntes i s'avisa el col·lectiu amb una notificació." },
  { key: "publicada", label: NEED_STATUS.publicada.label, hint: "Les preguntes són al banc de preguntes i el col·lectiu ha rebut una notificació al mòbil." },
  { key: "tancada", label: NEED_STATUS.tancada.label, hint: "L'equip l'ha tancada: ja no recull respostes de seguiment." },
];
const LABEL = Object.fromEntries(STATES.map((s) => [s.key, s.label])) as Record<NeedState, string>;

type Filter = NeedState | "totes";
const isFilter = (v: string | undefined): v is Filter => v === "totes" || STATES.some((s) => s.key === v);

const STATE_ICON: Record<NeedState, string> = {
  esborrany: "M4 3h6l3 3v7H4z M10 3v3h3", // page
  llesta: "M3 8.5l3 3 7-7", // check
  publicada: "M2 8l11-5-3 11-2.5-4.5z", // paper plane
  tancada: "M4 7V5a4 4 0 0 1 8 0v2 M3 7h10v7H3z", // lock
};

function StateBadge({ state }: { state: NeedState }) {
  const cls = state === "publicada" ? "badge-good" : state === "llesta" ? "badge-accent" : "";
  return (
    <span className={`badge ${cls}`}>
      <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={STATE_ICON[state]} />
      </svg>
      {LABEL[state]}
    </span>
  );
}

const EMPTY_NEXT: Record<NeedState, string> = {
  esborrany: "Cap necessitat espera revisió. Quan en creïs una, la IA proposarà preguntes i les hauràs d'aprovar.",
  llesta: "Cap necessitat espera publicació. Aprova totes les preguntes d'un esborrany perquè quedi llesta.",
  publicada: "Cap necessitat publicada. Publica'n una de llesta o crea'n una de nova.",
  tancada: "Cap necessitat tancada. Les necessitats tancades apareixeran aquí.",
};

const fmtDate = (d: string | null) => (d ? new Date(d.replace(" ", "T") + "Z").toLocaleDateString("ca-ES", { day: "numeric", month: "short", year: "numeric" }) : null);

export default async function NeedsPage({ searchParams }: { searchParams: Promise<{ estat?: string; publicada?: string; avis?: string; nova?: string }> }) {
  const { estat, publicada, avis, nova } = await searchParams;
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
        title="Consultes"
        subtitle="Descriu què vols escoltar; la IA proposa preguntes i una persona les aprova abans de publicar."
        actions={
          <Link href={showForm ? "/hr/needs" : "/hr/needs?nova=1#nova"} className="btn btn-primary" aria-expanded={showForm}>
            {showForm && all.length > 0 ? "Tanca el formulari" : "+ Nova consulta"}
          </Link>
        }
      />
      {publicada && avis && /^(off|<?\d+)$/.test(avis) && <PublishNotice avis={avis} />}
      {showForm && (
        <section id="nova" className="card mb-6">
          <div className="card-header">
            <h2 className="section-title">Nova necessitat</h2>
            <span className="text-xs text-subtle">La IA proposarà preguntes; no es publica res fins que les aprovis.</span>
          </div>
          <div className="card-body">
            <NeedForm collectius={listCollectius()} />
          </div>
        </section>
      )}

      {all.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filtra per estat" className="hr-seg">
            {([{ key: "totes", label: "Totes", n: all.length }, ...STATES.map((s) => ({ key: s.key, label: s.label, n: counts[s.key] }))] as { key: Filter; label: string; n: number }[]).map((f) => {
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
          <p className="text-xs text-subtle">Esborrany → Llesta → Publicada → Tancada</p>
        </div>
      )}

      {all.length > 0 && shown.length === 0 && filter !== "totes" && (
        <Empty>
          <p>{EMPTY_NEXT[filter]}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/hr/needs?nova=1#nova" className="btn btn-primary">+ Nova consulta</Link>
            <Link href="/hr/needs" className="btn btn-ghost">Mostra-les totes</Link>
          </div>
        </Empty>
      )}
      {shown.length > 0 && (
        <div className="space-y-4">
          {shown.map((n) => (
            <NeedItem key={n.id} n={n} draft={drafts.get(n.id)} domainIdx={domainIdx} />
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

function NeedItem({ n, draft, domainIdx }: { n: NeedCard; draft?: ReturnType<typeof listNeedDrafts>[number]; domainIdx: Map<string, number> }) {
  const state = STATES.find((s) => s.key === n.state)!;
  const live = n.state === "publicada" || n.state === "tancada";
  const pct = n.responses != null && n.population > 0 ? Math.min(100, Math.round((n.responses / n.population) * 100)) : null;
  const firstCode = n.publications[0]?.codi;
  const closeMsg = "Tanquem la necessitat? Les preguntes surten del banc de preguntes, deixa de rebre respostes i no es pot tornar a obrir.";
  return (
    <Card title={n.titol ?? n.textNl} meta={<StateBadge state={n.state} />}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Col·lectiu">{n.collectiu ?? "Tots els col·lectius"}</Fact>
          <Fact label="Creada">{fmtDate(n.creat) ?? "—"}</Fact>
          <Fact label="Publicada">{fmtDate(n.publicat) ?? (live ? "Data no registrada" : "Encara no")}</Fact>
          <Fact label="Participació">
            {!live ? (
              "Encara no recull respostes"
            ) : pct == null ? (
              <span title={`Menys de ${MIN_GROUP_SIZE} respostes: no es mostra`}>{n.responses == null ? `<${MIN_GROUP_SIZE} respostes` : "—"}</span>
            ) : (
              <span className="num">{n.responses} / {n.population} ({pct} %)</span>
            )}
          </Fact>
        </dl>
        {live && pct != null && (
          <div className="hr-bar" role="img" aria-label={`Participació ${pct} %`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {n.titol && <p className="text-sm text-subtle">Necessitat: {n.textNl}</p>}
        <p className="text-xs text-subtle">{state.hint}</p>

        {draft && <DraftReview g={draft} />}

        {n.approved.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Preguntes aprovades <span className="num text-subtle">{n.approved.length}{n.nDraft > 0 ? ` · ${n.nDraft} per revisar` : ""}</span>
            </h3>
            <ul className="hr-qlist">
              {n.approved.map((q) => (
                <li key={q.id}>
                  <span className="hr-chip-dot mt-1.5" style={{ background: `var(--dom-${domainIdx.get(q.domini) ?? "muted"})` }} title={q.domini} aria-hidden />
                  <span>
                    {q.text}
                    <span className="block text-xs text-subtle">{q.domini}</span>
                  </span>
                  <span className="hr-qmeta">
                    {questionTypeLabel(q.tipus)}
                    {live && <span className="num block">{q.answers != null ? `${q.answers} respostes` : `<${MIN_GROUP_SIZE} respostes`}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {n.duradaMaxS != null && <p className="text-xs text-subtle">Durada màxima: {n.duradaMaxS} s</p>}

        <div className="hr-actions flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {n.state === "esborrany" && n.approved.length === 0 && n.nDraft === 0 && <p className="mr-auto text-sm text-subtle">Aquesta necessitat no té cap pregunta. Pots tancar-la.</p>}
          {live && (
            <Link href="/hr/results" className="btn btn-ghost">Veure resultats</Link>
          )}
          {n.state === "publicada" && (
            <Link href={firstCode ? `/hr/publish#${firstCode}` : "/hr/publish"} className="btn btn-ghost">Enllaços i QR del col·lectiu</Link>
          )}
          {(n.state === "esborrany" && n.approved.length > 0 || n.state === "llesta") && (
            <form action={publishAction}>
              <input type="hidden" name="id" value={n.id} />
              <button className="btn btn-primary">Publica i envia la notificació</button>
            </form>
          )}
          {n.state !== "tancada" && (
            <form action={closeNeedAction}>
              <input type="hidden" name="id" value={n.id} />
              <ConfirmButton className="btn btn-ghost" message={closeMsg}>Tanca la necessitat</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Result of the last publish: an aggregate device count only, never who was notified. */
function PublishNotice({ avis }: { avis: string }) {
  const text =
    avis === "off"
      ? "Necessitat publicada. Les preguntes ja són al banc de preguntes, però les notificacions estan desactivades en aquest servidor (falten les claus VAPID), així que no s'ha avisat ningú."
      : avis.startsWith("<")
        ? `Necessitat publicada. S'han enviat notificacions a menys de ${MIN_GROUP_SIZE} dispositius: no en mostrem el nombre exacte.`
        : `Necessitat publicada. S'han enviat notificacions a ${avis} dispositius del col·lectiu.`;
  return (
    <p role="status" className="mb-6 rounded-lg border border-line-strong px-3 py-2 text-sm">
      {text}
    </p>
  );
}
