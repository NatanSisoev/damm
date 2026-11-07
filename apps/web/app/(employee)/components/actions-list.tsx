import type { ApprovedAction } from "@damm/db/employee";

const MESOS = [
  "gener", "febrer", "març", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre",
];

function periodLabel(periode: string): string {
  const [y, m] = periode.split("-");
  const name = MESOS[Number(m) - 1];
  return name ? `${name} ${y}` : periode;
}

// "Has dit, hem fet": actions HR approved for this person's collective. Aggregate context only
// (period and how many people were behind the signal); never who answered or what they said.
export function ActionsList({ actions }: { actions: ApprovedAction[] }) {
  return (
    <section aria-labelledby="has-dit" className="card mt-6">
      <div className="card-header">
        <h2 id="has-dit" className="section-title">
          Has dit, hem fet
        </h2>
      </div>
      <div className="card-body">
        {actions.length === 0 ? (
          <p className="text-muted">
            Encara no hi ha accions aprovades per al teu col·lectiu. Quan Recursos Humans en aprovi, les veuràs
            aquí, amb el període i quantes persones hi havia al darrere.
          </p>
        ) : (
          <ul className="space-y-3">
            {actions.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-surface-muted p-4">
                <p className="text-base leading-6">{a.text}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <span className="badge">{periodLabel(a.periode)}</span>
                  <span className="num">a partir de les respostes de {a.n} persones</span>
                  {a.seguimentEnMarxa && <span className="badge badge-good">Enquesta de seguiment en marxa</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
