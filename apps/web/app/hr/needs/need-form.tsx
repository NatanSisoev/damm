"use client";

import { useActionState, useState } from "react";
import { createNeedAction } from "../actions";

type Collectiu = { id: number; nom: string };

// Scenarios A, B and C from docs/requirements.md section 4. Synthetic wording only.
const EXAMPLES = [
  {
    key: "A",
    label: "A · Canvi de torns a planta",
    objective: "Vull entendre com està afectant el nou sistema de torns a planta, amb una consulta de menys de 2 minuts.",
    context: "El sistema de torns va canviar a l'octubre. Hi ha dubtes sobre com s'ha comunicat el canvi i sobre les pauses.",
    exclusions: "Salaris i hores extra. Preguntes sobre persones concretes.",
    collectiu: "Fàbriques",
    durada: 120,
  },
  {
    key: "B",
    label: "B · Logística des del mòbil",
    objective: "Vull saber com viuen els equips de logística les condicions de treball al magatzem, amb una consulta molt curta des del mòbil.",
    context: "Són persones sense ordinador i amb poc accés al correu. Responen dretes, entre tasques.",
    exclusions: "Salaris. Qualsevol cosa que permeti identificar una persona.",
    collectiu: "Logística",
    durada: 60,
  },
  {
    key: "C",
    label: "C · Opinions obertes",
    objective: "Vull recollir què opinen les persones sobre benestar, lideratge, comunicació, eines, organització i desenvolupament, per detectar temes nous.",
    context: "Volem molts comentaris lliures per poder-los agrupar i resumir. Entra en el seguiment continu.",
    exclusions: "Temes de nòmina i conflictes personals.",
    collectiu: "",
    durada: 180,
  },
];

export function NeedForm({ collectius }: { collectius: Collectiu[] }) {
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [collectiu, setCollectiu] = useState("0");
  const [durada, setDurada] = useState(120);
  const [state, formAction, pending] = useActionState(createNeedAction, null);

  const fill = (e: (typeof EXAMPLES)[number]) => {
    setObjective(e.objective);
    setContext(e.context);
    setExclusions(e.exclusions);
    setCollectiu(String(collectius.find((c) => c.nom === e.collectiu)?.id ?? 0));
    setDurada(e.durada);
  };

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <p className="label">Exemples per començar</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.key} type="button" onClick={() => fill(e)} className="btn btn-ghost" data-example={e.key}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="text_nl" className="label">Objectiu</label>
        <textarea
          id="text_nl" name="text_nl" required rows={3} className="input w-full resize-y"
          aria-invalid={state?.field === "text_nl"} aria-describedby={state ? "need-error" : undefined}
          value={objective} onChange={(e) => setObjective(e.target.value)}
          placeholder="Ex.: Volem saber com viuen els equips de planta el nou sistema de torns."
        />
      </div>
      <div>
        <label htmlFor="context" className="label">Context <span className="text-subtle">(opcional)</span></label>
        <textarea
          id="context" name="context" rows={3} className="input w-full resize-y"
          value={context} onChange={(e) => setContext(e.target.value)}
          placeholder="Què ha passat, a qui afecta, què en sabem ja."
        />
      </div>
      <div>
        <label htmlFor="exclusions" className="label">Què no s&apos;ha de preguntar <span className="text-subtle">(opcional)</span></label>
        <textarea
          id="exclusions" name="exclusions" rows={2} className="input w-full resize-y"
          value={exclusions} onChange={(e) => setExclusions(e.target.value)}
          placeholder="Ex.: Salaris. Preguntes sobre persones concretes."
        />
        <p className="mt-1 text-xs text-subtle">La IA no ho preguntarà, i les preguntes que ho toquin es descarten abans de mostrar-te-les.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="collectiu" className="label">Col·lectiu</label>
          <select id="collectiu" name="collectiu" className="input w-full" value={collectiu} onChange={(e) => setCollectiu(e.target.value)}>
            <option value="0">Tots els col·lectius</option>
            {collectius.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="durada" className="label">Durada màxima per persona (segons)</label>
          <input
            id="durada" name="durada" type="number" min={30} step={10} className="input num w-full"
            aria-invalid={state?.field === "durada"}
            value={durada} onChange={(e) => setDurada(Number(e.target.value))}
          />
        </div>
      </div>
      {state && (
        <div id="need-error" role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          <p>{state.error}</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <span className="text-xs text-subtle">{pending ? "La IA està redactant les preguntes…" : "Després podràs revisar i aprovar les preguntes a la mateixa targeta."}</span>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Generant…" : state && !state.field ? "Torna-ho a provar" : "Generar esborranys"}</button>
      </div>
    </form>
  );
}
