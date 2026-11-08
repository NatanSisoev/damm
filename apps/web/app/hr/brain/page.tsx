import { hrBrain } from "@/lib/hr-engine";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { brainDict } from "@/lib/i18n/hr-brain";
import { PageHeader } from "../ui";
import { BrainConsole } from "./brain-console";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(brainDict);
  return { title: t("meta_title") };
}
export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const t = await getT(brainDict);
  const brain = hrBrain();
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <BrainConsole initial={brain} />
    </>
  );
}
