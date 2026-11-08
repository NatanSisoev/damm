// Text for signals, built from the structured fields (type, domain, collective, shift) plus the
// figures that only exist inside the engine's English `descripcio`. Pure functions, no DB access.
// Never returns the English string: if the figures cannot be parsed, a sentence without numbers is used.
// Labels follow the UI language (default Catalan); the figures keep the engine's meaning.
import type { Lang } from "@damm/shared";
import { makeT } from "@/lib/i18n/core";
import { hrResultsDict } from "@/lib/i18n/hr-results";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";

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

/** "1.2" or "74" to "1,2" / "74" (ca, es) or "1.2" (en). */
const dec = (x: string, lang: Lang) => (lang === "en" ? x : x.replace(".", ","));
const WORD_KEYS = { 2: "sig_w2", 3: "sig_w3", 4: "sig_w4", 5: "sig_w5", 6: "sig_w6" } as const;

/** Segment: "Fàbriques, torn de nit" / "Logística" / "Tota l'empresa". */
export function signalSegment(s: Pick<SignalLike, "collectiu" | "torn">, lang: Lang = "ca"): string {
  const t = makeT(hrResultsDict, lang);
  const col = s.collectiu ? collectiveLabel(s.collectiu, lang) : t("sig_all");
  return s.torn ? `${col}, ${t("sig_shift", { shift: shiftLabel(s.torn, lang) })}` : col;
}

/** Headline: the domain first (what HR scans for), then who it is about. */
export function signalHeadline(s: Pick<SignalLike, "domini" | "collectiu" | "torn">, lang: Lang = "ca"): string {
  const seg = signalSegment(s, lang);
  return s.domini ? `${domainLabel(s.domini, lang)} · ${seg}` : seg;
}

/** Score values written as "(5.8 → 5.7 → 5.3)". */
function series(d: string): string[] {
  const m = d.match(/\(\s*(-?[\d.]+(?:\s*→\s*-?[\d.]+)+)\s*\)/);
  return m ? m[1].split("→").map((v) => v.trim()) : [];
}

/** What the signal says, in plain language (UI language), with the figures when they can be read. */
export function signalDetail(s: Pick<SignalLike, "tipus" | "descripcio">, lang: Lang = "ca"): string {
  const t = makeT(hrResultsDict, lang);
  const D = (x: string) => dec(x, lang);
  /** "de 0,8" but "d'1,2" (ca, un). */
  const deNum = (x: string) => t(/^1([.,]|$)/.test(x) ? "sig_de1" : "sig_de", { x: D(x) });
  const d = s.descripcio;
  const ser = series(d);
  /** Start, end and total change of a series, one decimal, in the UI's decimal style. */
  const span = (down: boolean) => {
    const f = Number(ser[0]);
    const l = Number(ser[ser.length - 1]);
    const x = Math.abs(l - f).toFixed(1);
    return { a: D(ser[0]), b: D(ser[ser.length - 1]), x: D(x), flat: Number(x) === 0 || (down ? l >= f : l <= f) };
  };
  switch (s.tipus) {
    case "sustained_decline": {
      const wk = WORD_KEYS[ser.length as keyof typeof WORD_KEYS];
      if (ser.length < 2) return t("sig_sd_plain");
      const r = span(true);
      return r.flat ? t("sig_sd_plain") : t("sig_sd_series", { count: wk ? t(wk) : String(ser.length), a: r.a, b: r.b, x: r.x });
    }
    case "sharp_drop": {
      const m = d.match(/fell\s+([\d.]+)\s+points?/i);
      if (ser.length >= 2) {
        const r = span(true);
        if (!r.flat) return t("sig_sharp", { a: r.a, b: r.b, x: r.x });
      }
      return m ? t("sig_sharp_x", { de: deNum(m[1]) }) : t("sig_sharp_plain");
    }
    case "feble": {
      const m = d.match(/decline of\s+([\d.]+)\s+points?\s+over\s+(\d+)\s+periods?/i);
      return m ? t("sig_weak", { x: D(m[1]), p: m[2] }) : t("sig_weak_plain");
    }
    case "polarisation": {
      const m = d.match(/fell\s+(\d+)\s+points?\s*\((\d+)\s*→\s*(\d+)\)/i);
      return m && Number(m[2]) > Number(m[3]) ? t("sig_polar", { x: String(Number(m[2]) - Number(m[3])), a: m[2], b: m[3] }) : t("sig_polar_plain");
    }
    case "changepoint_cluster": {
      const m = d.match(/^(\d+)\s+people.*?last\s+(\d+)\s+days/i);
      return m ? t("sig_cluster", { n: m[1], d: m[2] }) : t("sig_cluster_plain");
    }
    case "low_confidence": {
      const m = d.match(/\((\d+)\s*\/\s*100\)/);
      return m ? t("sig_lowconf", { x: m[1] }) : t("sig_lowconf_plain");
    }
    case "improvement": {
      const m = d.match(/rose\s+([\d.]+)\s+points?/i);
      if (ser.length >= 2) {
        const r = span(false);
        if (!r.flat) return t("sig_improve", { a: r.a, b: r.b, x: r.x });
      }
      return m ? t("sig_improve_x", { de: deNum(m[1]) }) : t("sig_improve_plain");
    }
    case "emergent":
      // Written by the analysis job: the theme label itself (data, kept as is).
      return d.trim() ? t("sig_emergent", { label: d.trim() }) : t("sig_emergent_plain");
    case "baixa_participacio": {
      const m = d.match(/(\d+(?:[.,]\d+)?)\s*%/);
      return m ? t("sig_lowpart", { x: D(m[1]) }) : t("sig_lowpart_plain");
    }
    default:
      return t("sig_default");
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
