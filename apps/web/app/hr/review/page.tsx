import QRCode from "qrcode";
import { listApprovedUnpublishedNeeds, listDrafts, listPublications } from "@damm/db/hr";
import {
  approveQuestionAction, discardQuestionAction, editQuestionAction, publishAction,
} from "../actions";
import { Card, Empty, PageHeader } from "../ui";

export default async function ReviewPage() {
  const drafts = listDrafts();
  const ready = listApprovedUnpublishedNeeds();
  const pubs = await Promise.all(
    listPublications().map(async (p) => ({
      ...p,
      qr: await QRCode.toDataURL(p.url, { margin: 1, width: 192 }),
    })),
  );
  return (
    <>
      <PageHeader
        title="Revisa les preguntes proposades"
        subtitle="Cap pregunta entra al grup fins que una persona l'aprova. Pots editar el text abans d'aprovar-la."
      />
      <div className="space-y-6">
        <Card title="Esborranys pendents" meta={<span className="num">{drafts.length}</span>} flush={drafts.length > 0}>
          {drafts.length === 0 ? (
            <Empty>No hi ha esborranys pendents.</Empty>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {drafts.map((q) => (
                <li key={q.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{q.domini}</span>
                    <span className="badge">{q.tipus}</span>
                    {q.generadaPerIa && <span className="badge badge-accent">Proposta de la IA</span>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <form action={editQuestionAction} className="flex w-full min-w-0 gap-2 lg:w-auto lg:flex-1">
                      <input type="hidden" name="id" value={q.id} />
                      <input name="text" defaultValue={q.text} aria-label="Text de la pregunta" className="input min-w-0 flex-1" />
                      <button className="btn btn-ghost">Desar text</button>
                    </form>
                    <form action={discardQuestionAction}>
                      <input type="hidden" name="id" value={q.id} />
                      <button className="btn">Descartar</button>
                    </form>
                    <form action={approveQuestionAction}>
                      <input type="hidden" name="id" value={q.id} />
                      <button className="btn btn-primary">Aprovar</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {ready.length > 0 && (
          <Card title="Llestes per publicar">
            <ul className="space-y-3">
              {ready.map((n) => (
                <li key={n.id}>
                  <form action={publishAction} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                    <input type="hidden" name="id" value={n.id} />
                    <span className="min-w-0 flex-1">{n.textNl}</span>
                    <span className="badge badge-good num">{n.approved} aprovades</span>
                    <button className="btn btn-primary">Publicar amb enllaç i QR</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {pubs.length > 0 && (
          <Card title="Publicades" meta={<span className="num">{pubs.length}</span>}>
            <ul className="grid gap-4 sm:grid-cols-2">
              {pubs.map((p) => (
                <li key={p.id} className="flex gap-4 rounded-lg border border-line p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.qr} alt={`QR de ${p.url}`} width={96} height={96} className="shrink-0 rounded-md border border-line bg-white p-1" />
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium">{p.textNl}</p>
                    <p className="text-xs text-subtle">Codi d&apos;accés <span className="badge num ml-1 font-mono">{p.codi}</span></p>
                    <a href={p.url} className="block truncate font-mono text-xs text-accent-ink hover:underline">{p.url}</a>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
