"use client";

import { useEffect, useState, type ReactNode } from "react";

const EVENT = "pool-fold-all";

/** One table group: a clickable header row and its question rows. Folding is per viewer and per page load. */
export function GroupBody({ header, children, count }: { header: ReactNode; children: ReactNode; count: number }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const on = (e: Event) => setOpen(!(e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <tbody>
      <tr className="pool-group">
        <td colSpan={9}>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="pool-group-btn">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>
              <path d="M6 3l5 5-5 5" />
            </svg>
            {header}
            {!open && <span className="text-subtle font-normal">· {count} amagades</span>}
          </button>
        </td>
      </tr>
      {open && children}
    </tbody>
  );
}

export function FoldAll() {
  const fire = (fold: boolean) => window.dispatchEvent(new CustomEvent(EVENT, { detail: fold }));
  return (
    <span className="flex gap-2">
      <button type="button" className="btn btn-ghost border border-line-strong px-3 py-1.5 text-xs" onClick={() => fire(false)}>Desplega-ho tot</button>
      <button type="button" className="btn btn-ghost border border-line-strong px-3 py-1.5 text-xs" onClick={() => fire(true)}>Plega-ho tot</button>
    </span>
  );
}
