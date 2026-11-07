"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RecoveryCodeScreen({ code, title }: { code: string; title: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm opacity-70">
        Aquest és el teu codi de recuperació. Només el veuràs ara: desa&apos;l en un lloc segur. Sense ell no podràs
        recuperar el compte si perds la contrasenya.
      </p>
      <div className="rounded border p-4 text-center font-mono text-lg tracking-wider select-all">{code}</div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" />
        L&apos;he desat
      </label>
      <button
        disabled={!saved}
        onClick={() => router.push("/")}
        className="w-full rounded bg-black px-4 py-3 text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        Continua
      </button>
    </div>
  );
}
