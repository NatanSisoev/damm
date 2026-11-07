"use client";

import { useActionState } from "react";
import { sendToTeams, type SendState } from "./teams-actions";

export function SendButton({ codi }: { codi: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendToTeams, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="codi" value={codi} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviant…" : "Envia al canal"}
      </button>
      {state && (
        <span role="status" className={`text-sm ${state.ok ? "text-subtle" : "text-red-700"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
