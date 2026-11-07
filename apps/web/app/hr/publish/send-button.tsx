"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { hrDict } from "@/lib/i18n/hr";
import { sendToTeams, type SendState } from "./teams-actions";

export function SendButton({ codi }: { codi: string }) {
  const t = useT(hrDict);
  const [state, action, pending] = useActionState<SendState, FormData>(sendToTeams, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="codi" value={codi} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? t("sending") : t("send_channel")}
      </button>
      {state && (
        <span role="status" className={`text-sm ${state.ok ? "text-subtle" : "text-warn"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
