import Link from "next/link";
import { listCollectius } from "@damm/db/hr";
import { Card, PageHeader } from "../hr/ui";
import { AggregateNote } from "./note";
import { getTL } from "@/lib/i18n/server";
import { managerDict } from "@/lib/i18n/manager";
import { collectiveLabel } from "@/lib/i18n/names";

export default async function ManagerIndexPage() {
  const { t, lang } = await getTL(managerDict);
  const collectius = listCollectius();
  return (
    <>
      <PageHeader title={t("index_title")} subtitle={t("index_subtitle")} />
      <AggregateNote />
      <Card title={t("index_card")} className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {collectius.map((c) => (
            <li key={c.id}>
              <Link href={`/manager/${encodeURIComponent(c.nom)}`} className="card block px-5 py-4 font-medium hover:bg-surface-muted">
                {collectiveLabel(c.nom, lang)} <span aria-hidden className="text-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
