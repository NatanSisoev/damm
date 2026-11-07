"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Recovery code shown once: grouped, selectable, with a copy button and a "save it now" step.
export function RecoveryCodeScreen({
  code,
  title,
  continueHref = "/",
  continueLabel = "Continua",
}: {
  code: string;
  title: string;
  continueHref?: string;
  continueLabel?: string;
}) {
  const router = useRouter();
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
        Desa&apos;l ara. Aquest codi només el veuràs una vegada.
      </p>
      <p className="text-muted">
        Si perds la contrasenya, aquest codi és l&apos;única manera de recuperar el compte. No tenim el teu correu ni
        telèfon, així que ningú més pot restablir-la.
      </p>
      <div
        className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-ink bg-surface p-4 text-center font-mono text-2xl font-bold tracking-widest select-all sm:grid-cols-4"
        aria-label={`Codi de recuperació: ${code.split("-").join(", ")}`}
      >
        {code.split("-").map((g, i) => (
          <span key={i} aria-hidden>
            {g}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="btn">
          Copia el codi
        </button>
        <span role="status" aria-live="polite" className="text-sm text-muted">
          {copied === "ok" && "Copiat."}
          {copied === "fail" && "No s'ha pogut copiar: selecciona'l i copia'l a mà."}
        </span>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-base">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 size-6 shrink-0 accent-[color:var(--accent)]"
        />
        <span>L&apos;he desat en un lloc segur</span>
      </label>
      <button disabled={!saved} onClick={() => router.push(continueHref)} className="btn btn-primary h-14 w-full text-base">
        {continueLabel}
      </button>
    </div>
  );
}
