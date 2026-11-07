import type { PoolReason, PoolState } from "@/lib/hr-engine";

export const STATE: Record<PoolState, { label: string; cls: string }> = {
  live: { label: "En circulació", cls: "badge-good" },
  waiting: { label: "En espera", cls: "badge-accent" },
  inactive: { label: "Fora del banc", cls: "" },
};

export const REASON: Record<PoolReason, string> = {
  live: "Entra als lots diaris",
  need_done: "Tothom del col·lectiu ja l'ha respost",
  followup_only: "Només es pregunta quan toca un seguiment personal",
  draft: "Esborrany: espera l'aprovació d'una persona",
  need_unpublished: "Aprovada, però la necessitat encara no s'ha publicat",
  need_closed: "La necessitat s'ha tancat",
  retired: "Retirada",
};

