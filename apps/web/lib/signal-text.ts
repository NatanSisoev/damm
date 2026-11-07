// Catalan text for signals, built from the structured fields (type, domain, collective, shift) plus the
// figures that only exist inside the engine's English `descripcio`. Pure functions, no DB access.
// Never returns the English string: if the figures cannot be parsed, a sentence without numbers is used.

export interface SignalLike {
  tipus: string;
  descripcio: string;
  domini?: string | null;
  collectiu?: string | null;
  torn?: string | null;
  severity?: string | null;
  n?: number;
}

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** "1.2" or "74" to "1,2" / "74". */
const dec = (x: string) => x.replace(".", ",");
const WORDS: Record<number, string> = { 2: "dos", 3: "tres", 4: "quatre", 5: "cinc", 6: "sis" };
const count = (n: number) => WORDS[n] ?? String(n);
/** "de 0,8" but "d'1,2" (un). */
const deNum = (x: string) => (/^1([.,]|$)/.test(x) ? `d'${dec(x)}` : `de ${dec(x)}`);

const SHIFT: Record<string, string> = { mati: "matí", tarda: "tarda", nit: "nit" };
const shiftLabel = (torn: string) => `torn de ${SHIFT[torn] ?? torn}`;

/** Segment: "Fàbriques, torn de nit" / "Logística" / "Tota l'empresa". */
export function signalSegment(s: Pick<SignalLike, "collectiu" | "torn">): string {
  const col = s.collectiu ?? "Tota l'empresa";
  return s.torn ? `${col}, ${shiftLabel(s.torn)}` : col;
}

/** Headline: the domain first (what HR scans for), then who it is about. */
export function signalHeadline(s: Pick<SignalLike, "domini" | "collectiu" | "torn">): string {
  const seg = signalSegment(s);
  return s.domini ? `${s.domini} · ${seg}` : seg;
}

/** Score values written as "(5.8 → 5.7 → 5.3)". */
function series(d: string): string[] {
  const m = d.match(/\(\s*(-?[\d.]+(?:\s*→\s*-?[\d.]+)+)\s*\)/);
  return m ? m[1].split("→").map((v) => v.trim()) : [];
}

/** What the signal says, in plain Catalan, with the figures when they can be read. */
export function signalDetail(s: Pick<SignalLike, "tipus" | "descripcio">): string {
  const d = s.descripcio;
  const ser = series(d);
  const range = ser.length >= 2 ? ` (${ser.map(dec).join(" → ")})` : "";
  switch (s.tipus) {
    case "sustained_decline":
      return ser.length >= 2
        ? `Puntuació a la baixa ${count(ser.length)} períodes seguits: ${ser.map(dec).join(" → ")}`
        : "La puntuació va baixant període rere període";
    case "sharp_drop": {
      const m = d.match(/fell\s+([\d.]+)\s+points?/i);
      return m ? `Caiguda ${deNum(m[1])} punts respecte al període anterior${range}` : "La puntuació ha caigut de cop respecte al període anterior";
    }
    case "feble": {
      const m = d.match(/decline of\s+([\d.]+)\s+points?\s+over\s+(\d+)\s+periods?/i);
      return m
        ? `Descens lent però constant: ${dec(m[1])} punts en ${m[2]} períodes`
        : "Descens lent però constant en els últims períodes";
    }
    case "polarisation": {
      const m = d.match(/fell\s+(\d+)\s+points?\s*\((\d+)\s*→\s*(\d+)\)/i);
      return m
        ? `El consens ha caigut ${m[1]} punts (${m[2]} → ${m[3]}): les opinions es divideixen`
        : "El consens del grup ha baixat: les opinions es divideixen";
    }
    case "changepoint_cluster": {
      const m = d.match(/^(\d+)\s+people.*?last\s+(\d+)\s+days/i);
      return m
        ? `${m[1]} persones han baixat la seva valoració en aquest àmbit els últims ${m[2]} dies`
        : "Diverses persones han baixat la seva valoració en aquest àmbit en poc temps";
    }
    case "low_confidence": {
      const m = d.match(/\((\d+)\s*\/\s*100\)/);
      return m
        ? `Confiança baixa (${m[1]} de 100): encara hi ha poques respostes per fiar-se'n`
        : "Confiança baixa: encara hi ha poques respostes per fiar-se'n";
    }
    case "improvement": {
      const m = d.match(/rose\s+([\d.]+)\s+points?/i);
      return m
        ? `Millora ${deNum(m[1])} punts des que es va vincular una acció${range}`
        : "La puntuació ha millorat des que es va vincular una acció";
    }
    case "emergent":
      // Written by the analysis job: the theme label itself (Catalan).
      return d.trim() ? `Tema nou als comentaris: «${d.trim()}»` : "Tema nou als comentaris";
    case "baixa_participacio": {
      const m = d.match(/(\d+(?:[.,]\d+)?)\s*%/);
      return m ? `Participació baixa (${dec(m[1])} %): els resultats poden no representar tot el grup` : "Participació baixa: els resultats poden no representar tot el grup";
    }
    default:
      return "Hi ha hagut un canvi que cal revisar";
  }
}

/** Size of the movement, for sorting inside the same severity (score points; consensus points are scaled to the 0-10 score). */
export function signalDrop(s: Pick<SignalLike, "tipus" | "descripcio">): number {
  const ser = series(s.descripcio).map(Number).filter(Number.isFinite);
  if (ser.length >= 2 && s.tipus !== "improvement") return Math.max(0, ser[0] - ser[ser.length - 1]);
  const m = s.descripcio.match(/(?:fell|decline of)\s+([\d.]+)/i);
  if (!m) return 0;
  return s.tipus === "polarisation" ? Number(m[1]) / 10 : Number(m[1]);
}

/** Severity first (critical, warning, info), then the size of the drop, then the group size. */
export function compareSignals(a: SignalLike, b: SignalLike): number {
  return (
    (SEV_RANK[a.severity ?? ""] ?? 3) - (SEV_RANK[b.severity ?? ""] ?? 3) ||
    signalDrop(b) - signalDrop(a) ||
    (b.n ?? 0) - (a.n ?? 0)
  );
}
