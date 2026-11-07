import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { listCollectius, listNeedCards, listNeedDrafts, type NeedCard, type NeedState } from "@damm/db/hr";
import { closeNeedAction, publishAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { NEED_STATUS } from "../labels";
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

export default async function NeedsPage({ searchParams }: { searchParams: Promise<{ estat?: string; publicada?: string; avis?: string }> }) {
  const { estat, publicada, avis } = await searchParams;
  const filter: Filter = isFilter(estat) ? estat : "totes";
  const all = listNeedCards();
  const drafts = new Map(listNeedDrafts().map((g) => [g.id, g]));
  const counts = Object.fromEntries(STATES.map((s) => [s.key, all.filter((n) => n.state === s.key).length])) as Record<NeedState, number>;
  const shown = filter === "totes" ? all : all.filter((n) => n.state === filter);
  const rank = (n: NeedCard) => STATES.findIndex((s) => s.key === n.state);
  shown.sort((a, b) => rank(a) - rank(b) || b.id - a.id);

  return (
    <>
      <PageHeader
        title="Necessitats"
        subtitle="Cada necessitat segueix el seu camí: esborrany, llesta per publicar, publicada i tancada. Cap pregunta arriba al banc de preguntes sense que una persona l'aprovi."
      />
      {publicada && avis && /^(off|<?\d+)$/.test(avis) && <PublishNotice avis={avis} />}
      <details open={all.length === 0} className="card mb-6 group">
        <summary className="card-header cursor-pointer list-none">
          <h2 className="section-title">Nova necessitat</h2>
          <span className="text-xs text-subtle group-open:hidden">Descriu què vols escoltar i la IA proposarà preguntes</span>
        </summary>
        <div className="card-body">
          <NeedForm collectius={listCollectius()} />
        </div>
      </details>

      <nav aria-label="Filtra per estat" className="mb-4 flex flex-wrap gap-2">
        {([{ key: "totes", label: "Totes", n: all.length }, ...STATES.map((s) => ({ key: s.key, label: s.label, n: counts[s.key] }))] as { key: Filter; label: string; n: number }[]).map((f) => (
          <Link
            key={f.key}
            href={f.key === "totes" ? "/hr/needs" : `/hr/needs?estat=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`btn ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
          >
            {f.label} <span className="num ml-1 opacity-70">{f.n}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Empty>{all.length === 0 ? "Encara no hi ha cap necessitat. Crea'n una amb el formulari de dalt." : `No hi ha cap necessitat en estat «${filter === "totes" ? "" : LABEL[filter]}».`}</Empty>
      ) : (
        <div className="space-y-6">
          {shown.map((n) => (
            <NeedItem key={n.id} n={n} draft={drafts.get(n.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function NeedItem({ n, draft }: { n: NeedCard; draft?: ReturnType<typeof listNeedDrafts>[number] }) {
  const state = STATES.find((s) => s.key === n.state)!;
  return (
    <Card
      title={n.titol ?? n.textNl}
      meta={<span className={`badge ${n.state === "publicada" ? "badge-good" : n.state === "llesta" ? "badge-accent" : ""}`}>{state.label}</span>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-subtle">
          <span className="badge">{n.collectiu ?? "Tots els col·lectius"}</span>
          {n.duradaMaxS != null && <span className="badge num">màx. {n.duradaMaxS} s</span>}
          <span className="num">{n.approved.length} aprovades{n.nDraft > 0 ? ` · ${n.nDraft} per revisar` : ""}</span>
        </div>
        {n.titol && <p className="text-sm text-subtle">Necessitat: {n.textNl}</p>}
        <p className="text-xs text-subtle">{state.hint}</p>

        {draft && <DraftReview g={draft} />}

        {n.approved.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Preguntes aprovades</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {n.approved.map((q) => (
                <li key={q.id}>
                  {q.text} <span className="badge ml-1">{q.domini}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {(n.state === "esborrany" && n.approved.length > 0 || n.state === "llesta" || n.state === "publicada") && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            {n.state !== "publicada" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className="btn btn-primary">Publica i envia la notificació</button>
              </form>
            )}
            {n.state === "publicada" && (
              <>
                <Link href="/hr/publish" className="btn btn-ghost">Codis d&apos;invitació</Link>
                <form action={closeNeedAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="btn">Tanca la necessitat</button>
                </form>
              </>
            )}
          </div>
        )}
        {n.state === "llesta" && (
          <form action={closeNeedAction} className="text-right">
            <input type="hidden" name="id" value={n.id} />
            <button className="btn btn-ghost">Tanca la necessitat</button>
          </form>
        )}
        {n.state === "esborrany" && n.approved.length === 0 && n.nDraft === 0 && (
          <p className="text-sm text-subtle">Aquesta necessitat no té cap pregunta. Pots tancar-la.</p>
        )}
        {n.state === "esborrany" && (
          <form action={closeNeedAction} className="text-right">
            <input type="hidden" name="id" value={n.id} />
            <button className="btn btn-ghost">Tanca la necessitat</button>
          </form>
        )}
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
