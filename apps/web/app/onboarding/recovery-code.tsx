"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";

// Recovery code shown once: grouped, selectable, with a copy button and a "save it now" step.
export function RecoveryCodeScreen({
  code,
  title,
  continueHref = "/",
  continueLabel,
}: {
  code: string;
  title: string;
  continueHref?: string;
  continueLabel?: string;
}) {
  const router = useRouter();
  const t = useT(employeeDict);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="page-title">{title}</h1>
      <p className="rounded-xl border-2 border-accent bg-accent-soft px-4 py-3 font-semibold">
        {t("rec_save_now")}
      </p>
      <p className="text-muted">
        {t("rec_explain")}
      </p>
      <div
        className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-ink bg-surface p-4 text-center font-mono text-2xl font-bold tracking-widest select-all sm:grid-cols-4"
        aria-label={t("rec_aria", { code: code.split("-").join(", ") })}
      >
        {code.split("-").map((g, i) => (
          <span key={i} aria-hidden>
            {g}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="btn">
          {t("rec_copy")}
        </button>
        <span role="status" aria-live="polite" className="text-sm text-muted">
          {copied === "ok" && t("rec_copied")}
          {copied === "fail" && t("rec_copy_fail")}
        </span>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-base">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 size-6 shrink-0 accent-[color:var(--accent)]"
        />
        <span>{t("rec_saved")}</span>
      </label>
      <button disabled={!saved} onClick={() => router.push(continueHref)} className="btn btn-primary h-14 w-full text-base">
        {continueLabel ?? t("continue")}
      </button>
    </div>
  );
}
