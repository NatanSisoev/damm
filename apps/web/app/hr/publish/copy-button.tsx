"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { hrDict } from "@/lib/i18n/hr";

export function CopyButton({ text }: { text: string }) {
  const t = useT(hrDict);
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className="btn btn-ghost" aria-live="polite">
      {done ? t("copied") : t("copy_link")}
    </button>
  );
}
