"use client";

import type { ComponentProps } from "react";

/** Submit button that asks for confirmation first. Use for actions that cannot be undone. */
export function ConfirmButton({ message, ...props }: { message: string } & ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
