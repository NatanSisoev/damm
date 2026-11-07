import { estimateSeconds } from "@damm/ai";
import type { NeedDraftGroup } from "@damm/db/hr";
import { questionTypeLabel } from "../labels";
import {
  approveQuestionAction, discardQuestionAction, editNeedHeaderAction, editQuestionAction, moveDraftAction,
  regenerateQuestionAction,
} from "../actions";

/** Draft review for one need: title and intro, then each proposed question with its actions. */
export function DraftReview({ g }: { g: NeedDraftGroup }) {
  const secs = estimateSeconds(g.questions.map((q) => q.tipusAi));
  const over = g.duradaMaxS != null && secs > g.duradaMaxS;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {g.draftFont === "fallback" ? (
          <span className="badge" title="La IA no ha estat disponible: són preguntes de plantilla">Plantilla de reserva</span>
        ) : (
          <span className="badge badge-accent">Proposta de la IA</span>
        )}
        <span className={`badge num ${over ? "badge-warn" : ""}`}>
          ~{secs} s{g.duradaMaxS != null ? ` de ${g.duradaMaxS} s` : ""}
        </span>
        <span className="num text-xs text-subtle">{g.questions.length} per revisar</span>
      </div>
      {over && (
        <p role="alert" className="mt-3 rounded-lg border border-line-strong px-3 py-2 text-sm">
          Atenció: el temps estimat ({secs} s) supera la durada màxima ({g.duradaMaxS} s). Descarta alguna pregunta o canvia-la per una de més curta.
        </p>
      )}
      <form action={editNeedHeaderAction} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={g.id} />
        <input name="titol" defaultValue={g.titol ?? ""} aria-label="Títol" placeholder="Títol" className="input w-full" />
        <textarea name="intro" defaultValue={g.intro ?? ""} aria-label="Introducció" placeholder="Introducció" rows={2} className="input w-full resize-y" />
        <button className="btn btn-ghost">Desa el títol i la introducció</button>
      </form>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {g.questions.map((q, i) => (
          <li key={q.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-xs text-subtle">{i + 1}.</span>
              <span className="badge">{q.domini}</span>
              <span className="badge">{questionTypeLabel(q.tipus)}</span>
              <span className="num text-xs text-subtle">~{estimateSeconds([q.tipusAi])} s</span>
            </div>
            {q.motiu && <p className="text-sm text-subtle">Per què: {q.motiu}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <form action={editQuestionAction} className="flex w-full min-w-0 gap-2 lg:w-auto lg:flex-1">
                <input type="hidden" name="id" value={q.id} />
                <input name="text" defaultValue={q.text} aria-label="Text de la pregunta" className="input min-w-0 flex-1" />
                <button className="btn btn-ghost">Desa el text</button>
              </form>
              <form action={moveDraftAction}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="btn btn-ghost" disabled={i === 0} aria-label="Mou amunt">↑</button>
              </form>
              <form action={moveDraftAction}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="dir" value="down" />
                <button className="btn btn-ghost" disabled={i === g.questions.length - 1} aria-label="Mou avall">↓</button>
              </form>
              <form action={regenerateQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn btn-ghost">Torna a generar</button>
              </form>
              <form action={discardQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn">Descarta</button>
              </form>
              <form action={approveQuestionAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn btn-primary">Aprova</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
