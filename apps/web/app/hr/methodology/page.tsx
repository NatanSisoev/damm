import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { COLLECTIUS, DOMINIS, MIN_GROUP_SIZE, PERIODES_SEED, RETENTION, TORNS } from "@damm/shared";
import {
  CHANGE_MIN_DELTA,
  CHANGE_MIN_N,
  PRECISION_MODERADA_MIN_N,
  PRECISION_SOLIDA_MIN_N,
  UNDER_REPRESENTED_RATIO,
} from "@damm/db/hr";
import { getT, getTL } from "@/lib/i18n/server";
import { LOCALES } from "@/lib/i18n/core";
import { hrDict, collectiveLabel, shiftLabel } from "@/lib/i18n/hr";
import { bold } from "@/lib/i18n/rich";
import { Card, PageHeader } from "../ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(hrDict);
  return { title: t("meth_meta_title") };
}

// The results page flags representativeness gaps of 5 pp or more (results/page.tsx, `Math.abs(r.gap) >= 0.05`).
const GAP_FLAG_PP = 5;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="max-w-3xl space-y-3 text-[14px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </Card>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="num rounded-lg bg-surface-muted px-4 py-3 text-[13px] text-ink">{children}</p>;
}

export default async function MethodologyPage() {
  const { t, lang } = await getTL(hrDict);
  const delta = CHANGE_MIN_DELTA.toLocaleString(LOCALES[lang]);
  const collectives = COLLECTIUS.map((c) => collectiveLabel(c, lang)).join(", ");
  const shifts = TORNS.map((s) => shiftLabel(s, lang)).join(", ");
  return (
    <>
      <PageHeader
        title={t("meth_title")}
        subtitle={t("meth_subtitle")}
        actions={<Link href="/hr/results" className="btn">{t("meth_back")}</Link>}
      />

      <div className="space-y-6">
        <Section title={t("meth_s1")}>
          <p>{bold(t("meth_s1_p1", { collectives, shifts }))}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{bold(t("meth_s1_li1"))}</li>
            <li>{bold(t("meth_s1_li2"))}</li>
          </ul>
          <Formula>{t("meth_s1_formula")}</Formula>
          <p>{bold(t("meth_s1_p2", { pp: GAP_FLAG_PP }))}</p>
          <p>{bold(t("meth_s1_p3", { pct: Math.round(UNDER_REPRESENTED_RATIO * 100), min: MIN_GROUP_SIZE }))}</p>
        </Section>

        <Section title={t("meth_s2")}>
          <p>{bold(t("meth_s2_p1"))}</p>
          <div className="overflow-x-auto">
            <table className="table min-w-[28rem]">
              <thead>
                <tr><th>{t("meth_th_precision")}</th><th>{t("meth_th_n")}</th><th>{t("meth_th_read")}</th></tr>
              </thead>
              <tbody>
                <tr><td className="font-semibold">{t("meth_prec_ind")}</td><td className="num">n &lt; {PRECISION_MODERADA_MIN_N}</td><td>{t("meth_prec_ind_read")}</td></tr>
                <tr><td className="font-semibold">{t("meth_prec_mod")}</td><td className="num">{PRECISION_MODERADA_MIN_N} ≤ n &lt; {PRECISION_SOLIDA_MIN_N}</td><td>{t("meth_prec_mod_read")}</td></tr>
                <tr><td className="font-semibold">{t("meth_prec_sol")}</td><td className="num">n ≥ {PRECISION_SOLIDA_MIN_N}</td><td>{t("meth_prec_sol_read")}</td></tr>
              </tbody>
            </table>
          </div>
          <p>{bold(t("meth_s2_p2"))}</p>
          <p>{bold(t("meth_s2_p3"))}</p>
          <Formula>{t("meth_s2_formula", { delta, n: CHANGE_MIN_N })}</Formula>
          <p>{t("meth_s2_p4")}</p>
          <p>{bold(t("meth_s2_p5"))}</p>
        </Section>

        <Section title={t("meth_s3")}>
          <p>{bold(t("meth_s3_p1", { min: MIN_GROUP_SIZE }))}</p>
          <p>{bold(t("meth_s3_p2", { min: MIN_GROUP_SIZE }))}</p>
        </Section>

        <Section title={t("meth_s4")}>
          <ul className="list-disc space-y-1 pl-5">
            {(["meth_s4_li1", "meth_s4_li2", "meth_s4_li3", "meth_s4_li4", "meth_s4_li5"] as const).map((k) => (
              <li key={k}>{bold(t(k))}</li>
            ))}
          </ul>
        </Section>

        <Section title={t("meth_s5")}>
          <p>{t("meth_s5_p1")}</p>
        </Section>

        <Section title={t("meth_s6")}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{bold(t("meth_s6_li1"))}</li>
            <li>{bold(t("meth_s6_li2"))}</li>
            <li>{bold(t("meth_s6_li3", { n: PERIODES_SEED.length, periods: PERIODES_SEED.join(", ") }))}</li>
            <li>{bold(t("meth_s6_li4", { domains: DOMINIS.length, collectives: COLLECTIUS.length }))}</li>
            <li>{bold(t("meth_s6_li5"))}</li>
            <li>{bold(t("meth_s6_li6"))}</li>
            <li>{bold(t("meth_s6_li7"))}</li>
            <li>{bold(t("meth_s6_li8"))}</li>
          </ul>
        </Section>

        <Section title={t("meth_s7")}>
          <p>{bold(t("meth_s7_p1", { raw: RETENTION.rawResponseMonths, inactive: RETENTION.inactiveAccountMonths, push: RETENTION.pushSubscriptionMonths }))}</p>
          <p>{bold(t("meth_s7_p2", { min: MIN_GROUP_SIZE }))}</p>
        </Section>
      </div>
    </>
  );
}
