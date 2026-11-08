import Link from "next/link";
import { listCollectius, listNeedDrafts } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { pageTitle } from "@/lib/i18n/titles";
import { PageHeader } from "../../ui";
import { NeedForm } from "./need-form";
import { DraftReview } from "../draft-review";

export const generateMetadata = pageTitle("hr_needs_new");

export const dynamic = "force-dynamic";

/** Writing a new query gets its own page: one task, no list around it. Submitting runs createNeedAction, which lands on the draft review. */
export default async function NewNeedPage({ searchParams }: { searchParams: Promise<{ draft?: string; regenError?: string }> }) {
  const { draft, regenError } = await searchParams;
  const { t } = await getTL(hrDict);
  // After creating, the action lands here with ?draft=<need id>: the AI questions are reviewed on this page, not on the list.
  const draftId = Number(draft) || null;
  const group = draftId ? listNeedDrafts().find((g) => g.id === draftId) : undefined;
  if (draftId) {
    return (
      <>
        <PageHeader
          title={t("needs_new_review_title")}
          subtitle={t("needs_new_review_intro")}
          actions={<Link href="/hr/needs" className="btn btn-ghost">&larr; {t("needs_new_back")}</Link>}
        />
        {group ? (
          <section className="card mb-6">
            <div className="card-body">
              <DraftReview g={group} regenError={Number(regenError) || null} onNewPage />
            </div>
          </section>
        ) : (
          <section className="card mb-6">
            <div className="card-body">
              <p className="text-sm">{t("needs_new_review_done")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/hr/needs" className="btn btn-primary">{t("needs_new_to_list")}</Link>
                <Link href="/hr/needs/new" className="btn btn-ghost">{t("needs_new_another")}</Link>
              </div>
            </div>
          </section>
        )}
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={t("needs_new_title")}
        subtitle={t("needs_new_intro")}
        actions={<Link href="/hr/needs" className="btn btn-ghost">&larr; {t("needs_new_back")}</Link>}
      />
      <section className="card mb-6">
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
