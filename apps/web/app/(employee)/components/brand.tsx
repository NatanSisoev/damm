import type { ReactNode } from "react";

// Scope for the employee brand tokens (brand.css). HR and manager pages never render this.
export function BrandFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`brand ${className}`}>{children}</div>;
}

// Hop-texture hero with outline display type, as in the "Proposta mixta" mock.
export function BrandHero({
  eyebrow,
  title,
  lede,
  size = "md",
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  size?: "md" | "lg";
  children?: ReactNode;
}) {
  return (
    <section className="hop rounded-b-[28px] px-5 pb-8 pt-5 md:rounded-[28px]">
      <p className="font-[family-name:var(--display)] text-lg tracking-wide text-[color:var(--on-hop)]">Escolta activa</p>
      <div className="mt-8">
        {eyebrow && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] hop-lede">{eyebrow}</p>}
        <h1 className={`out ${size === "lg" ? "text-[56px] sm:text-[64px]" : "text-[40px] sm:text-[48px]"}`}>{title}</h1>
        {lede && <p className="hop-lede mt-3 max-w-sm text-base">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-muted">
      <span aria-hidden>🔒</span>
      <span>{children}</span>
    </p>
  );
}
