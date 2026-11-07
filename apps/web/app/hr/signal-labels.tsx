// Catalan labels for senyal type, severity and status (C1: engine alarms add new types and both fields).

const TIPUS: Record<string, string> = {
  emergent: "Emergent",
  feble: "Senyal feble",
  baixa_participacio: "Baixa participació",
  sharp_drop: "Caiguda brusca",
  sustained_decline: "Descens sostingut",
  changepoint_cluster: "Canvis agrupats",
  polarisation: "Polarització",
  low_confidence: "Poca confiança",
  improvement: "Millora",
};

const SEVERITY: Record<string, { label: string; cls: string }> = {
  info: { label: "Info", cls: "" },
  warning: { label: "Avís", cls: "badge-warn" },
  critical: { label: "Crític", cls: "badge-warn" },
};

const STATUS: Record<string, string> = {
  open: "Oberta",
  acknowledged: "Revisada",
  action_linked: "Amb acció",
  resolved: "Resolta",
};

export const signalTypeLabel = (tipus: string) => TIPUS[tipus] ?? tipus;

/** Type badge plus severity and status when the engine set them. */
export function SignalBadges({ tipus, severity, status }: { tipus: string; severity?: string | null; status?: string | null }) {
  const sev = severity ? SEVERITY[severity] : undefined;
  return (
    <>
      <span className={`badge ${tipus === "improvement" ? "badge-good" : "badge-warn"}`}>{signalTypeLabel(tipus)}</span>
      {sev && <span className={`badge ${sev.cls}`}>{sev.label}</span>}
      {status && <span className="badge">{STATUS[status] ?? status}</span>}
    </>
  );
}
