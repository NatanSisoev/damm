import type { ReactNode } from "react";

interface RecommendationBody {
  text: string;
  titol?: string | null;
  iniciativa?: string | null;
  responsableSuggerit?: string | null;
  terminiSuggerit?: string | null;
  justificacio?: string | null;
  limits?: string | null;
  font?: "llm" | "template" | null;
  aprovadaEl?: string | null;
}

/** Structured body of a recommendation: what, who, when, why, limits and source. No "done" state: HR only approves or discards. */
export function RecommendationBody({ r }: { r: RecommendationBody }): ReactNode {
  return (
    <div className="space-y-2">
      {r.font && (
        <span
          className={`badge ${r.font === "llm" ? "badge-accent" : ""}`}
          title={r.font === "llm" ? "Text redactat pel model d'IA a partir de dades agregades" : "Text de la biblioteca de plantilles, sense IA"}
        >
          {r.font === "llm" ? "Redactat per IA" : "Plantilla"}
        </span>
      )}
      {r.titol && <h3 className="font-medium">{r.titol}</h3>}
      <p>{r.text}</p>
      {r.iniciativa && <p className="text-[13px]"><span className="font-medium">Iniciativa:</span> {r.iniciativa}</p>}
      {(r.responsableSuggerit || r.terminiSuggerit) && (
        <p className="text-[13px] text-muted">
          {r.responsableSuggerit && <>Responsable suggerit: {r.responsableSuggerit}</>}
          {r.responsableSuggerit && r.terminiSuggerit && " · "}
          {r.terminiSuggerit && <>Termini suggerit: {r.terminiSuggerit}</>}
        </p>
      )}
      {r.justificacio && <p className="text-[13px] text-muted"><span className="font-medium">Per què:</span> {r.justificacio}</p>}
      {r.limits && <p className="text-xs text-subtle"><span className="font-medium">Límits:</span> {r.limits}</p>}
      {r.aprovadaEl && <p className="text-xs text-subtle">Aprovada el {r.aprovadaEl.slice(0, 10)}</p>}
    </div>
  );
}
