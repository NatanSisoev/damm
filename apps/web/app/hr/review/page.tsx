import QRCode from "qrcode";
import { estimateSeconds } from "@damm/ai";
import { listApprovedUnpublishedNeeds, listNeedDrafts, listPublications } from "@damm/db/hr";
import {
  approveQuestionAction, discardQuestionAction, editNeedHeaderAction, editQuestionAction, moveDraftAction, publishAction,
  regenerateQuestionAction,
} from "../actions";
import { Card, Empty, PageHeader } from "../ui";

export default async function ReviewPage() {
  const groups = listNeedDrafts();
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
        {groups.length === 0 && (
          <Card title="Esborranys pendents"><Empty>No hi ha esborranys pendents.</Empty></Card>
        )}
        {groups.map((g) => {
          const secs = estimateSeconds(g.questions.map((q) => q.tipusAi));
          const over = g.duradaMaxS != null && secs > g.duradaMaxS;
          return (
            <Card
              key={g.id}
              title={g.titol ?? "Esborrany sense títol"}
              meta={<span className="num">{g.questions.length} preguntes</span>}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {g.draftFont === "fallback" ? (
                    <span className="badge" title="La IA no ha estat disponible: són preguntes de plantilla">Plantilla de reserva</span>
                  ) : (
                    <span className="badge badge-accent">Proposta de la IA</span>
                  )}
                  {g.collectiu && <span className="badge">{g.collectiu}</span>}
                  <span className={`badge num ${over ? "badge-warn" : ""}`}>
                    ~{secs} s{g.duradaMaxS != null ? ` de ${g.duradaMaxS} s` : ""}
                  </span>
                </div>
                {over && (
                  <p role="alert" className="rounded-lg border border-line-strong px-3 py-2 text-sm">
                    Atenció: el temps estimat ({secs} s) supera la durada màxima ({g.duradaMaxS} s). Descarta alguna pregunta o canvia-la per una de més curta.
                  </p>
                )}
                <p className="text-sm text-subtle">Necessitat: {g.textNl}</p>
                <form action={editNeedHeaderAction} className="space-y-2">
                  <input type="hidden" name="id" value={g.id} />
                  <input name="titol" defaultValue={g.titol ?? ""} aria-label="Títol" placeholder="Títol" className="input w-full" />
                  <textarea name="intro" defaultValue={g.intro ?? ""} aria-label="Introducció" placeholder="Introducció" rows={2} className="input w-full resize-y" />
                  <button className="btn btn-ghost">Desar títol i introducció</button>
                </form>
              </div>
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {g.questions.map((q, i) => (
                  <li key={q.id} className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-xs text-subtle">{i + 1}.</span>
                      <span className="badge">{q.domini}</span>
                      <span className="badge">{q.tipus}</span>
                      <span className="num text-xs text-subtle">~{estimateSeconds([q.tipusAi])} s</span>
                    </div>
                    {q.motiu && <p className="text-sm text-subtle">Per què: {q.motiu}</p>}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <form action={editQuestionAction} className="flex w-full min-w-0 gap-2 lg:w-auto lg:flex-1">
                        <input type="hidden" name="id" value={q.id} />
                        <input name="text" defaultValue={q.text} aria-label="Text de la pregunta" className="input min-w-0 flex-1" />
                        <button className="btn btn-ghost">Desar text</button>
                      </form>
                      <form action={moveDraftAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button className="btn btn-ghost" disabled={i === 0} aria-label="Moure amunt">↑</button>
                      </form>
                      <form action={moveDraftAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button className="btn btn-ghost" disabled={i === g.questions.length - 1} aria-label="Moure avall">↓</button>
                      </form>
                      <form action={regenerateQuestionAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <button className="btn btn-ghost">Regenerar</button>
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
            </Card>
          );
        })}
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
                    <span className="badge">{p.collectiu}</span>
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
