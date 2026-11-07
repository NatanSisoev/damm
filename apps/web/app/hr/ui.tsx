import type { ReactNode } from "react";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="max-w-2xl text-subtle">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Card({
  title, meta, children, className = "", flush = false, id,
}: { id?: string; title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section id={id} className={`card ${className}`}>
      {(title || meta) && (
        <div className="card-header">
          {title && <h2 className="section-title">{title}</h2>}
          {meta && <div className="text-xs text-subtle">{meta}</div>}
        </div>
      )}
      <div className={flush ? "mt-4 overflow-x-auto rounded-b-[11px]" : "card-body"}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-subtle">{children}</div>
  );
}

export async function SuppressedBadge({ title }: { title?: string }) {
  const t = await getT(hrDict);
  return (
    <span className="badge" title={title}>
      <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      {t("suppressed")}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-xs font-medium text-subtle">{label}</div>
      <div className="num mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </div>
  );
}

/** Shows the first `visible` items and folds the rest into a native <details> (no client JS). */
export async function FoldList({
  items, visible = 5, as = "ul", className = "",
}: { items: ReactNode[]; visible?: number; as?: "ul" | "div"; className?: string }) {
  const t = await getT(hrDict);
  const Tag = as;
  const rest = items.slice(visible);
  return (
    <>
      <Tag className={className}>{items.slice(0, visible)}</Tag>
      {rest.length > 0 && (
        <details className="hr-fold">
          <summary>
            <span className="hr-fold-open">{t("show_more", { n: rest.length })}</span>
            <span className="hr-fold-close">{t("show_less")}</span>
          </summary>
          <Tag className={className}>{rest}</Tag>
        </details>
      )}
    </>
  );
}
