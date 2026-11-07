import Link from "next/link";
import QRCode from "qrcode";
import { listCollectius, listNeedCards, listNeedDrafts, type NeedCard, type NeedState } from "@damm/db/hr";
import { closeNeedAction, publishAction } from "../actions";
import { Card, Empty, PageHeader } from "../ui";
import { DraftReview } from "./draft-review";
import { NeedForm } from "./need-form";

export const dynamic = "force-dynamic";

const STATES: { key: NeedState; label: string; hint: string }[] = [
  { key: "esborrany", label: "Esborrany", hint: "La IA ha proposat preguntes; falta que una persona les revisi i les aprovi." },
  { key: "llesta", label: "Llesta per publicar", hint: "Totes les preguntes estan revisades. Falta publicar-la amb enllaç i QR." },
  { key: "publicada", label: "Publicada", hint: "Les preguntes són al grup de preguntes i l'enllaç ja es pot compartir." },
  { key: "tancada", label: "Tancada", hint: "Decisió de l'equip: no hi entren noves respostes de seguiment." },
];
const LABEL = Object.fromEntries(STATES.map((s) => [s.key, s.label])) as Record<NeedState, string>;

type Filter = NeedState | "totes";
const isFilter = (v: string | undefined): v is Filter => v === "totes" || STATES.some((s) => s.key === v);

export default async function NeedsPage({ searchParams }: { searchParams: Promise<{ estat?: string }> }) {
  const { estat } = await searchParams;
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
        subtitle="Cada necessitat segueix el seu camí: esborrany, llesta per publicar, publicada i tancada. Cap pregunta arriba al grup sense que una persona l'aprovi."
      />
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

async function NeedItem({ n, draft }: { n: NeedCard; draft?: ReturnType<typeof listNeedDrafts>[number] }) {
  const qrs = await Promise.all(n.publications.map((p) => QRCode.toDataURL(p.url, { margin: 1, width: 192 })));
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

        {n.publications.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {n.publications.map((p, i) => (
              <li key={p.id} className="flex gap-4 rounded-lg border border-line p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrs[i]} alt={`QR de ${p.url}`} width={96} height={96} className="shrink-0 rounded-md border border-line bg-white p-1" />
                <div className="min-w-0 space-y-2">
                  <span className="badge">{p.collectiu}</span>
                  <p className="text-xs text-subtle">Codi d&apos;accés <span className="badge num ml-1 font-mono">{p.codi}</span></p>
                  <a href={p.url} className="block truncate font-mono text-xs text-accent-ink hover:underline">{p.url}</a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {(n.state === "esborrany" && n.approved.length > 0 || n.state === "llesta" || n.state === "publicada") && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            {n.state !== "publicada" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className="btn btn-primary">Publicar amb enllaç i QR</button>
              </form>
            )}
            {n.state === "publicada" && (
              <>
                <Link href="/hr/publish" className="btn btn-ghost">Cartell i enllaços de tots els col·lectius</Link>
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
