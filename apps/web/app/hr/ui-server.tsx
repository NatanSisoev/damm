// Server-only HR UI pieces (they read the request language). Client components use ./ui.
import type { ReactNode } from "react";
import { getT } from "@/lib/i18n/server";
import { hrDict } from "@/lib/i18n/hr";
import { SuppressedBadge as Badge } from "./ui";

export async function SuppressedBadge({ title }: { title?: string }) {
  const t = await getT(hrDict);
  return <Badge title={title} label={t("suppressed")} />;
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
