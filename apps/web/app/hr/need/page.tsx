import { listCollectius } from "@damm/db/hr";
import { NeedForm } from "./need-form";
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
          <NeedForm collectius={collectius} />
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
