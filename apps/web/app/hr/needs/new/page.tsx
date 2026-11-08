import Link from "next/link";
import { listCollectius } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { pageTitle } from "@/lib/i18n/titles";
import { PageHeader } from "../../ui";
import { NeedForm } from "./need-form";

export const generateMetadata = pageTitle("hr_needs_new");

export const dynamic = "force-dynamic";

/** Writing a new query gets its own page: one task, no list around it. Submitting runs createNeedAction, which lands on the draft review. */
export default async function NewNeedPage() {
  const { t } = await getTL(hrDict);
  return (
    <>
      <PageHeader
        title={t("needs_new_title")}
        subtitle={t("needs_new_intro")}
        actions={<Link href="/hr/needs" className="btn btn-ghost">&larr; {t("needs_new_back")}</Link>}
      />
      <section className="card mb-6 max-w-3xl">
        <div className="card-header">
          <span className="text-xs text-subtle">{t("needs_new_note")}</span>
        </div>
        <div className="card-body">
          <NeedForm collectius={listCollectius()} />
        </div>
      </section>
    </>
  );
}
