// Helpers to put markup inside translated strings.
import { Fragment, type ReactNode } from "react";

/** Replaces `{name}` placeholders in a template with React nodes. Unknown placeholders stay as text. */
export function rich(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((seg, i) => {
    const m = /^\{(\w+)\}$/.exec(seg);
    return m && m[1] in parts ? <Fragment key={i}>{parts[m[1]]}</Fragment> : seg;
  });
}

/** Renders `**bold**` segments as <strong>. */
export function bold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") ? <strong key={i}>{seg.slice(2, -2)}</strong> : seg,
  );
}
