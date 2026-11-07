import { listCollectius } from "@damm/db/hr";
import { createNeedAction } from "../actions";

export default function NeedPage() {
  const collectius = listCollectius();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Quina necessitat vols escoltar?</h1>
      <p className="text-sm opacity-70">Descriu-la amb les teves paraules. La IA en proposarà preguntes que hauràs d&apos;aprovar.</p>
      <form action={createNeedAction} className="space-y-3">
        <textarea name="text_nl" required rows={5} className="w-full rounded border p-3" placeholder="Ex.: Volem saber com viuen els equips de planta el nou sistema de torns." />
        <div className="flex gap-3 text-sm">
          <label>Durada màx. (s) <input name="durada" type="number" defaultValue={120} className="w-20 rounded border p-1" /></label>
          <label>Col·lectiu{" "}
            <select name="collectiu" className="rounded border p-1">
              <option value="0">Tots</option>
              {collectius.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
        </div>
        <button className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">Desar necessitat</button>
      </form>
      <p className="text-xs opacity-60">Les preguntes proposades per la IA apareixeran a Revisió quan la capa d&apos;IA estigui connectada.</p>
    </section>
  );
}
