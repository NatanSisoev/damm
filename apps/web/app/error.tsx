"use client";
import { useT } from "@/lib/i18n/client";
import { commonDict } from "@/lib/i18n/common";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(commonDict);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-12">
      <h1 className="page-title">{t("err_title")}</h1>
      <p className="text-muted">{t("err_body")}</p>
      <div>
        <button type="button" className="btn" onClick={() => reset()}>{t("err_retry")}</button>
      </div>
    </main>
  );
}
