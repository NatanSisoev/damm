"use client";

import type { ComponentProps } from "react";

/** GET filter form that submits as soon as a dropdown changes; the search box submits on Enter. */
export function AutoSubmitForm(props: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    />
  );
}
