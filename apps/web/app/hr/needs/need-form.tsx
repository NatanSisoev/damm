"use client";

import { useActionState, useState } from "react";
import { createNeedAction } from "../actions";
import { useT } from "@/lib/i18n/client";
import { hrDict, collectiveLabel, type HrKey } from "@/lib/i18n/hr";
import { useLang } from "@/lib/i18n/client";

type Collectiu = { id: number; nom: string };

// Scenarios A, B and C from docs/requirements.md section 4. Synthetic wording only.
// Texts live in hrDict (nf_ex_<key>_*); collectiu is the Catalan DB name.
/** Total time per person, in seconds (submitted as seconds; shown as minutes). */
const DURATIONS = [60, 120, 180, 300] as const;

const EXAMPLES = [
  { key: "a", collectiu: "Fàbriques", durada: 120 },
  { key: "b", collectiu: "Logística", durada: 60 },
  { key: "c", collectiu: "", durada: 180 },
] as const;

export function NeedForm({ collectius }: { collectius: Collectiu[] }) {
  const t = useT(hrDict);
  const lang = useLang();
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [collectiu, setCollectiu] = useState("0");
  const [durada, setDurada] = useState(120);
  const [state, formAction, pending] = useActionState(createNeedAction, null);

  const fill = (e: (typeof EXAMPLES)[number]) => {
    setObjective(t(`nf_ex_${e.key}_objective` as HrKey));
    setContext(t(`nf_ex_${e.key}_context` as HrKey));
    setExclusions(t(`nf_ex_${e.key}_exclusions` as HrKey));
    setCollectiu(String(collectius.find((c) => c.nom === e.collectiu)?.id ?? 0));
    setDurada(e.durada);
  };

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <p className="label">{t("nf_examples")}</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.key} type="button" onClick={() => fill(e)} className="btn btn-ghost" data-example={e.key.toUpperCase()}>
              {t(`nf_ex_${e.key}_label` as HrKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="text_nl" className="label">{t("nf_objective")}</label>
        <textarea
          id="text_nl" name="text_nl" required rows={3} className="input w-full resize-y"
          aria-invalid={state?.field === "text_nl"} aria-describedby={state ? "need-error" : undefined}
          value={objective} onChange={(e) => setObjective(e.target.value)}
          placeholder={t("nf_objective_ph")}
        />
      </div>
      <div>
        <label htmlFor="context" className="label">{t("nf_context")} <span className="text-subtle">{t("nf_optional")}</span></label>
        <textarea
          id="context" name="context" rows={3} className="input w-full resize-y"
          value={context} onChange={(e) => setContext(e.target.value)}
          placeholder={t("nf_context_ph")}
        />
      </div>
      <div>
        <label htmlFor="exclusions" className="label">{t("nf_exclusions")} <span className="text-subtle">{t("nf_optional")}</span></label>
        <textarea
          id="exclusions" name="exclusions" rows={2} className="input w-full resize-y"
          value={exclusions} onChange={(e) => setExclusions(e.target.value)}
          placeholder={t("nf_exclusions_ph")}
        />
        <p className="mt-1 text-xs text-subtle">{t("nf_exclusions_note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="collectiu" className="label">{t("nf_collective")}</label>
          <select id="collectiu" name="collectiu" className="input w-full" value={collectiu} onChange={(e) => setCollectiu(e.target.value)}>
            <option value="0">{t("all_collectives")}</option>
            {collectius.map((c) => <option key={c.id} value={c.id}>{collectiveLabel(c.nom, lang)}</option>)}
          </select>
        </div>
        <div>
          <span id="durada-label" className="label">{t("nf_duration")}</span>
          <input type="hidden" name="durada" value={durada} />
          <div role="radiogroup" aria-labelledby="durada-label" aria-describedby="durada-hint" className="flex gap-2">
            {DURATIONS.map((sec) => (
              <button
                key={sec} type="button" role="radio" aria-checked={durada === sec}
                className={`btn num flex-1 ${durada === sec ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setDurada(sec)}
              >
                {t("nf_minutes", { n: sec / 60 })}
              </button>
            ))}
          </div>
          <p id="durada-hint" className="mt-1 text-xs text-subtle" aria-live="polite">{t("nf_duration_hint", { n: Math.floor(durada / 8) })}</p>
        </div>
      </div>
      {state && (
        <div id="need-error" role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          <p>{state.error}</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <span className="text-xs text-subtle">{pending ? t("nf_drafting") : t("nf_after")}</span>
        <button className="btn btn-primary" disabled={pending}>{pending ? t("nf_generating") : state && !state.field ? t("nf_retry") : t("nf_generate")}</button>
      </div>
    </form>
  );
}
