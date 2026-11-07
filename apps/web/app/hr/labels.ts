// Catalan labels for raw enum values the DB stores (estat, tipus). Never render the raw value.

export const RECOMMENDATION_STATUS: Record<string, { label: string; cls: string }> = {
  proposada: { label: "Proposada", cls: "" },
  aprovada: { label: "Aprovada", cls: "badge-good" },
  descartada: { label: "Descartada", cls: "" },
};

export const NEED_STATUS: Record<string, { label: string; cls: string }> = {
  esborrany: { label: "Esborrany", cls: "" },
  llesta: { label: "Llesta per publicar", cls: "badge-accent" },
  publicada: { label: "Publicada", cls: "badge-good" },
  tancada: { label: "Tancada", cls: "" },
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  scale5: "1–5",
  scale10: "1–10",
  yes_no: "Sí / No",
  pair: "Parella",
  choice: "Opció",
  ranking: "Ordenació",
  open: "Oberta",
};

export const recommendationStatus = (estat: string) =>
  RECOMMENDATION_STATUS[estat] ?? { label: estat, cls: "" };
export const needStatus = (estat: string) => NEED_STATUS[estat] ?? { label: estat, cls: "" };
export const questionTypeLabel = (tipus: string) => QUESTION_TYPE_LABELS[tipus] ?? tipus;

/** "1 minut", "2 minuts". */
export const minutes = (n: number) => `${n} ${n === 1 ? "minut" : "minuts"}`;
