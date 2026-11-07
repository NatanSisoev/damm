// Reference-data names (domains, collectives, shifts) are stored in Catalan in the DB.
// These helpers map them to the UI language. Unknown values fall back to the input unchanged.
import type { Lang } from "@damm/shared";

type Names = Record<string, { es: string; en: string }>;

const DOMAINS: Names = {
  "Benestar": { es: "Bienestar", en: "Wellbeing" },
  "Lideratge": { es: "Liderazgo", en: "Leadership" },
  "Desenvolupament": { es: "Desarrollo", en: "Development" },
  "Cultura i pertinença": { es: "Cultura y pertenencia", en: "Culture and belonging" },
  "Entorn i relacions": { es: "Entorno y relaciones", en: "Environment and relationships" },
  "Condicions i organització": { es: "Condiciones y organización", en: "Conditions and organisation" },
};

const COLLECTIVES: Names = {
  "Fàbriques": { es: "Fábricas", en: "Factories" },
  "Logística": { es: "Logística", en: "Logistics" },
  "Comercial": { es: "Comercial", en: "Sales" },
  "Oficines": { es: "Oficinas", en: "Offices" },
};

// Shift ids in the DB are `mati`, `tarda`, `nit` (no accent).
const SHIFTS: Record<string, { ca: string; es: string; en: string }> = {
  mati: { ca: "matí", es: "mañana", en: "morning" },
  tarda: { ca: "tarda", es: "tarde", en: "afternoon" },
  nit: { ca: "nit", es: "noche", en: "night" },
};

function pick(map: Names, name: string, lang: Lang): string {
  if (lang === "ca") return name;
  return map[name]?.[lang] ?? name;
}

export const domainLabel = (name: string, lang: Lang): string => pick(DOMAINS, name, lang);
export const collectiveLabel = (name: string, lang: Lang): string => pick(COLLECTIVES, name, lang);
/** Shift id (`mati`, `tarda`, `nit`) to its label in the UI language ("matí" / "mañana" / "morning"). */
export const shiftLabel = (torn: string, lang: Lang): string => SHIFTS[torn]?.[lang] ?? torn;
