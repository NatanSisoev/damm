export default function NeedPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Quina necessitat vols escoltar?</h1>
      <p className="text-sm opacity-70">Descriu-la amb les teves paraules. La IA en proposarà preguntes que hauràs d&apos;aprovar.</p>
      <form className="space-y-3">
        <textarea name="text_nl" rows={5} className="w-full rounded border p-3" placeholder="Ex.: Volem saber com viuen els equips de planta el nou sistema de torns." />
        <div className="flex gap-3 text-sm">
          <label>Durada màx. (s) <input name="durada" type="number" defaultValue={120} className="w-20 rounded border p-1" /></label>
          <label>Col·lectiu <select name="collectiu" className="rounded border p-1"><option>Tots</option><option>Fàbriques</option><option>Logística</option><option>Comercial</option><option>Oficines</option></select></label>
        </div>
        <button type="button" disabled className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">Generar esborrany (pendent d&apos;API)</button>
      </form>
    </section>
  );
}
