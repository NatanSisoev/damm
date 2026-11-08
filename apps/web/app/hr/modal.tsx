"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { commonDict } from "@/lib/i18n/common";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

/** Native `<dialog>`: the browser handles the focus trap, Esc and the top layer. Rendered in place, so a modal inside a `<form>` can submit it. */
export function Modal({ open, onClose, title, footer, wide, children }: ModalProps) {
  const t = useT(commonDict);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`hr-modal${wide ? " hr-modal-wide" : ""}`}
      aria-labelledby={title ? titleId : bodyId}
      onCancel={(e) => {
        // React bubbles `cancel`: Esc on a stacked modal must not also close this one.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          {title && (
            <div className="hr-modal-head">
              <h2 id={titleId} className="hr-modal-title">{title}</h2>
              <button type="button" className="hr-modal-x" aria-label={t("modal_close")} onClick={onClose}>
                <span aria-hidden>×</span>
              </button>
            </div>
          )}
          <div id={bodyId} className="hr-modal-body">{children}</div>
          {footer && <div className="hr-modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** A modal whose open state lives in the URL, for content the server renders. Closing goes back to `closeHref` without scrolling. */
export function RouteModal({ closeHref, ...props }: Omit<ModalProps, "open" | "onClose"> & { closeHref: string }) {
  const router = useRouter();
  return <Modal {...props} open onClose={() => router.replace(closeHref, { scroll: false })} />;
}
