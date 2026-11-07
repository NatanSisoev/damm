import { listCollectius } from "@damm/db/hr";
import { createNeedAction } from "../actions";
import { Card, PageHeader } from "../ui";

export default function NeedPage() {
  const collectius = listCollectius();
  return (
    <>
      <PageHeader
        title="Quina necessitat vols escoltar?"
        subtitle="Descriu-la amb les teves paraules. La IA en proposarà preguntes, i cap entra a l'enquesta fins que una persona les aprova."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <form action={createNeedAction} className="space-y-5">
            <div>
              <label htmlFor="text_nl" className="label">Necessitat</label>
              <textarea
                id="text_nl"
                name="text_nl"
                required
                rows={6}
                className="input w-full resize-y"
                placeholder="Ex.: Volem saber com viuen els equips de planta el nou sistema de torns."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="collectiu" className="label">Col·lectiu</label>
                <select id="collectiu" name="collectiu" className="input w-full">
                  <option value="0">Tots els col·lectius</option>
                  {collectius.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="durada" className="label">Durada màxima per persona (segons)</label>
                <input id="durada" name="durada" type="number" min={30} step={10} defaultValue={120} className="input num w-full" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
              <span className="text-xs text-subtle">Després passaràs a Revisió.</span>
              <button className="btn btn-primary">Desar necessitat</button>
            </div>
          </form>
        </Card>
        <aside className="space-y-3 text-[13px] text-muted">
          <h2 className="text-xs font-semibold tracking-wide text-subtle uppercase">Com funciona</h2>
          <ol className="space-y-3">
            {[
              ["Necessitat", "Ho escrius en llenguatge natural."],
              ["Esborranys", "La IA proposa preguntes curtes per al col·lectiu."],
              ["Aprovació", "Una persona edita, aprova o descarta cada pregunta."],
              ["Publicació", "Les aprovades entren al grup de preguntes, amb enllaç i QR."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-medium text-ink">{i + 1}</span>
                <span><span className="font-medium text-ink">{t}.</span> {d}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
