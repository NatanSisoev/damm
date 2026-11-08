import Link from "next/link";
import { commonDict } from "@/lib/i18n/common";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT(commonDict);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-12">
      <h1 className="page-title">{t("nf_title")}</h1>
      <p className="text-muted">{t("nf_body")}</p>
      <div>
        <Link href="/" className="btn">{t("nf_home")}</Link>
      </div>
    </main>
  );
}
