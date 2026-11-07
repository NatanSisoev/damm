import { MIN_GROUP_SIZE } from "@damm/shared";
import { employeeDict } from "@/lib/i18n/employee";
import { getT } from "@/lib/i18n/server";
import { getCompteId } from "@/lib/session";
import { EmployeeShell } from "../(employee)/components/shell";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4">
      <div className="card-body space-y-2">
        <h2 className="section-title">{title}</h2>
        {children}
      </div>
    </section>
  );
}

const list = "list-disc space-y-1.5 pl-5 text-muted";

// Plain-language transparency page. Every claim maps to code: see packages/db/schema.sql
// (compte, resposta, v_resposta_analitica, push_subscripcio) and employee-repository.ts.
export default async function PrivacyPage() {
  // Public on purpose: people deciding whether to join must be able to read it.
  const loggedIn = Boolean(await getCompteId());
  const t = await getT(employeeDict);
  const min = MIN_GROUP_SIZE;
  return (
    <EmployeeShell
      back
      backHref={loggedIn ? "/" : "/login"}
      backLabel={loggedIn ? t("nav_home") : t("enter")}
      title={t("priv_title")}
    >
      <h1 className="page-title">{t("priv_h1")}</h1>
      <p className="mt-1 text-subtle">{t("priv_lede")}</p>

      <Section title={t("priv_collect_title")}>
        <ul className={list}>
          <li>{t("priv_collect_1")}</li>
          <li>{t("priv_collect_2")}</li>
          <li>{t("priv_collect_3")}</li>
          <li>{t("priv_collect_4")}</li>
          <li>{t("priv_collect_5")}</li>
          <li>{t("priv_collect_6")}</li>
        </ul>
      </Section>

      <Section title={t("priv_hr_title")}>
        <ul className={list}>
          <li>{t("priv_hr_1")}</li>
          <li>{t("priv_hr_2", { min })}</li>
          <li>{t("priv_hr_3")}</li>
        </ul>
      </Section>

      <Section title={t("priv_never_title")}>
        <ul className={list}>
          <li>{t("priv_never_1")}</li>
          <li>{t("priv_never_2")}</li>
          <li>{t("priv_never_3")}</li>
          <li>{t("priv_never_4")}</li>
        </ul>
      </Section>

      <Section title={t("priv_comments_title")}>
        <p className="text-muted">{t("priv_comments_text")}</p>
      </Section>

      <Section title={t("priv_account_title")}>
        <ul className={list}>
          <li>{t("priv_account_1")}</li>
          <li>{t("priv_account_2")}</li>
          <li>{t("priv_account_3")}</li>
        </ul>
      </Section>
    </EmployeeShell>
  );
}
