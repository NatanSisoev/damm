"use client";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { commonDict } from "@/lib/i18n/common";
import { Modal } from "./modal";
import { SubmitButton } from "./submit-button";

type ConfirmButtonProps = Omit<ComponentProps<"button">, "title"> & {
  message: ReactNode;
  title?: ReactNode;
  busyLabel?: ReactNode;
};

/** Modal buttons inside the form: the confirm button submits it and the modal closes once the action ends. */
function FormActions({ onClose, label, busyLabel, name, value }: { onClose: () => void; label: ReactNode; busyLabel?: ReactNode; name?: string; value?: ComponentProps<"button">["value"] }) {
  const t = useT(commonDict);
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onClose();
    wasPending.current = pending;
  }, [pending, onClose]);
  return (
    <>
      <button type="button" className="btn" disabled={pending} onClick={onClose}>{t("modal_cancel")}</button>
      <SubmitButton className="btn btn-primary" name={name} value={value} busyLabel={busyLabel ?? label}>{label}</SubmitButton>
    </>
  );
}

/** Goes inside a server-action form and asks in a modal before submitting it. Use for actions that cannot be undone. */
export function ConfirmButton({ message, title, busyLabel, children, name, value, ...props }: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button {...props} type="button" onClick={() => setOpen(true)}>{children}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={<FormActions onClose={() => setOpen(false)} label={children} busyLabel={busyLabel} name={name} value={value} />}
      >
        {message}
      </Modal>
    </>
  );
}

/** The same question for client-side actions that have no form. */
export function ConfirmDialog({ open, onClose, onConfirm, message, confirmLabel }: { open: boolean; onClose: () => void; onConfirm: () => void; message: ReactNode; confirmLabel: ReactNode }) {
  const t = useT(commonDict);
  return (
    <Modal
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t("modal_cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={() => { onClose(); onConfirm(); }}>{confirmLabel}</button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
