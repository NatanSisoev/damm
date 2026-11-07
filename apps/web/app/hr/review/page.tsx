import QRCode from "qrcode";
import { listApprovedUnpublishedNeeds, listDrafts, listPublications } from "@damm/db/hr";
import {
  approveQuestionAction, discardQuestionAction, editQuestionAction, publishAction,
} from "../actions";

const btn = "rounded border px-3 py-1 text-sm";

export default async function ReviewPage() {
  const drafts = listDrafts();
  const ready = listApprovedUnpublishedNeeds();
  const pubs = await Promise.all(
    listPublications().map(async (p) => ({
      ...p,
      qr: await QRCode.toDataURL(p.url, { margin: 1, width: 160 }),
    })),
  );
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Revisa les preguntes proposades</h1>
        <p className="text-sm opacity-70">Cap pregunta entra al grup fins que una persona l&apos;aprova.</p>
      </div>
      {drafts.length === 0 && <p className="text-sm opacity-70">No hi ha esborranys pendents.</p>}
      <ul className="space-y-3">
        {drafts.map((q) => (
          <li key={q.id} className="rounded border p-3">
            <div className="text-xs opacity-60">{q.domini} · {q.tipus}{q.generadaPerIa ? " · IA" : ""}</div>
            <form action={editQuestionAction} className="my-2 flex gap-2">
              <input type="hidden" name="id" value={q.id} />
              <input name="text" defaultValue={q.text} className="flex-1 rounded border p-1" />
              <button className={btn}>Desar</button>
            </form>
            <div className="flex gap-2">
              <form action={approveQuestionAction}><input type="hidden" name="id" value={q.id} /><button className={btn}>Aprovar</button></form>
              <form action={discardQuestionAction}><input type="hidden" name="id" value={q.id} /><button className={btn}>Descartar</button></form>
            </div>
          </li>
        ))}
      </ul>
      {ready.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Llestes per publicar</h2>
          {ready.map((n) => (
            <form key={n.id} action={publishAction} className="flex items-center gap-3 rounded border p-3 text-sm">
              <input type="hidden" name="id" value={n.id} />
              <span className="flex-1">{n.textNl} ({n.approved} aprovades)</span>
              <button className="rounded bg-black px-3 py-1 text-white dark:bg-white dark:text-black">Publicar (enllaç i QR)</button>
            </form>
          ))}
        </div>
      )}
      {pubs.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Publicades</h2>
          <ul className="space-y-1 text-sm">
            {pubs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.qr} alt={`QR de ${p.url}`} width={96} height={96} />
                <div>{p.textNl}<br /><code>{p.url}</code> · codi <b>{p.codi}</b></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
