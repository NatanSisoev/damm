import Link from "next/link";
import { listCollectius } from "@damm/db/hr";
import { Card, PageHeader } from "../hr/ui";
import { AggregateNote } from "./note";

export default function ManagerIndexPage() {
  const collectius = listCollectius();
  return (
    <>
      <PageHeader title="Vista de responsables" subtitle="Tria el col·lectiu del qual vols veure els resultats." />
      <AggregateNote />
      <Card title="Col·lectius" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {collectius.map((c) => (
            <li key={c.id}>
              <Link href={`/manager/${encodeURIComponent(c.nom)}`} className="card block px-5 py-4 font-medium hover:bg-surface-muted">
                {c.nom} <span aria-hidden className="text-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
