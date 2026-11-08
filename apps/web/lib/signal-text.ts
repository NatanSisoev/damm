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
  /** Period the signal was raised in ("2026-10"); names the points of its series. */
  periode?: string | null;
}

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** "1.2" or "74" to "1,2" / "74" (ca, es) or "1.2" (en). */
const dec = (x: string, lang: Lang) => (lang === "en" ? x : x.replace(".", ","));
/** Unit word for a figure: singular for exactly 1 ("1 punt sobre 10"), plural otherwise. `x` uses "." or "," as decimal. */
export function pointsUnit(x: string | number, scale: boolean, lang: Lang): string {
  const one = Number(String(x).replace(",", ".")) === 1;
  return makeT(hrResultsDict, lang)(scale ? (one ? "sig_u1" : "sig_u") : one ? "sig_pt1" : "sig_pt");
}
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
      return r.flat ? t("sig_sd_plain") : t("sig_sd_series", { count: wk ? t(wk) : String(ser.length), a: r.a, b: r.b, x: r.x, u: pointsUnit(r.x, true, lang) });
    }
    case "sharp_drop": {
      const m = d.match(/fell\s+([\d.]+)\s+points?/i);
      if (ser.length >= 2) {
        const r = span(true);
        if (!r.flat) return t("sig_sharp", { a: r.a, b: r.b, x: r.x, u: pointsUnit(r.x, true, lang) });
      }
      return m ? t("sig_sharp_x", { de: deNum(m[1]), u: pointsUnit(m[1], true, lang) }) : t("sig_sharp_plain");
    }
    case "feble": {
      const m = d.match(/decline of\s+([\d.]+)\s+points?\s+over\s+(\d+)\s+periods?/i);
      return m ? t("sig_weak", { x: D(m[1]), p: m[2], u: pointsUnit(m[1], true, lang) }) : t("sig_weak_plain");
    }
    case "polarisation": {
      const m = d.match(/fell\s+(\d+)\s+points?\s*\((\d+)\s*→\s*(\d+)\)/i);
      return m && Number(m[2]) > Number(m[3]) ? t("sig_polar", { x: String(Number(m[2]) - Number(m[3])), a: m[2], b: m[3], pt: pointsUnit(Number(m[2]) - Number(m[3]), false, lang) }) : t("sig_polar_plain");
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
        if (!r.flat) return t("sig_improve", { a: r.a, b: r.b, x: r.x, u: pointsUnit(r.x, true, lang) });
      }
      return m ? t("sig_improve_x", { de: deNum(m[1]), u: pointsUnit(m[1], true, lang) }) : t("sig_improve_plain");
    }
    case "emergent":
      // Written by the analysis job: the theme label itself (data, kept as is).
      if (!d.trim()) return t("sig_emergent_plain");
      {
        // Engine wording (Catalan): "<theme>: tema emergent a <collective>. Ha passat a ser el 23% dels comentaris (+19 punts ...)".
        const m = d.match(/^(.+?): tema emergent a .+?\.\s*Ha passat a ser el (\d+(?:[.,]\d+)?)\s*% dels comentaris \(\+(\d+) punts/);
        if (m) return t("sig_emergent_full", { label: m[1], share: D(m[2].replace(",", ".")), p: m[3], pt: pointsUnit(m[3], false, lang) });
      }
      return t("sig_emergent", { label: d.trim() });
    case "baixa_participacio": {
      const m = d.match(/(\d+(?:[.,]\d+)?)\s*%/);
      return m ? t("sig_lowpart", { x: D(m[1]) }) : t("sig_lowpart_plain");
    }
    default:
      return t("sig_default");
  }
}

const MONTHS: Record<Lang, string[]> = {
  ca: ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** Names of the `count` consecutive months ending at `periode` ("2026-10"), oldest first. Empty when the period is unknown. */
function periodNames(periode: string | null | undefined, count: number, lang: Lang): string[] {
  const m = periode?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return [];
  const end = Number(m[1]) * 12 + Number(m[2]) - 1;
  return Array.from({ length: count }, (_, i) => MONTHS[lang][(((end - (count - 1 - i)) % 12) + 12) % 12]);
}

export interface SignalTrend {
  /** Short name of the movement: "Baixa sostinguda". */
  label: string;
  /** Signed change with one decimal in the UI's decimal style ("−1,1"); null when the signal has no single figure. */
  delta: string;
  /** "punts" / "punts de consens". */
  unit: string;
  /** Series as read from the engine, unrounded. Empty when there is none (weak signals). */
  values: number[];
  /** One name per value (month, or before/now). Empty strings when the period is unknown. */
  names: string[];
  /** Full series in words, for the sparkline's aria-label. */
  aria: string;
  /** One-line text without markup (push, search): "Baixa sostinguda · −1,1 punts (ago→oct)". */
  plain: string;
}

const SIGNED = (n: number, lang: Lang) => `${n < 0 ? "−" : "+"}${dec(Math.abs(n).toFixed(1), lang)}`;

/**
 * Option C text for a signal that moves along a series: short label, signed delta, the values to plot.
 * Null for the other types (their sentence from `signalDetail` is used).
 */
export function signalTrend(s: Pick<SignalLike, "tipus" | "descripcio" | "periode">, lang: Lang = "ca"): SignalTrend | null {
  const t = makeT(hrResultsDict, lang);
  const ser = series(s.descripcio);
  const values = ser.map(Number);
  const hasSeries = values.length >= 2 && values.every(Number.isFinite);
  const build = (label: string, change: number, unitKey: "sig_tr_unit" | "sig_tr_unit_cons", names: string[], decimals: boolean, tail?: string): SignalTrend => {
    const unit = t(unitKey);
    const delta = decimals ? SIGNED(change, lang) : `${change < 0 ? "−" : "+"}${Math.abs(Math.round(change))}`;
    const named = values.map((v, i) => `${names[i] ? `${names[i]} ` : ""}${dec(ser[i], lang)}`).join(", ");
    const span = names[0] && names[names.length - 1] ? `${names[0]}→${names[names.length - 1]}` : "";
    const paren = tail ?? span;
    return {
      label, delta, unit, values, names,
      aria: t("sig_tr_aria", { label, series: named, delta, unit }),
      plain: `${label} · ${delta} ${unit}${paren ? ` (${paren})` : ""}`,
    };
  };
  const last = values[values.length - 1];
  const change = hasSeries ? last - values[0] : 0;
  const shown = Number(Math.abs(change).toFixed(1));
  switch (s.tipus) {
    case "sustained_decline":
    case "sharp_drop":
      if (!hasSeries || change >= 0 || shown === 0) return null;
      return build(t(s.tipus === "sharp_drop" ? "sig_tl_sharp" : "sig_tl_sd"), change, "sig_tr_unit", periodNames(s.periode, values.length, lang), true);
    case "improvement":
      if (!hasSeries || change <= 0 || shown === 0) return null;
      return build(t("sig_tl_improve"), change, "sig_tr_unit", [t("sig_tr_before"), t("sig_tr_now")].slice(0, 2).concat(values.slice(2).map(() => "")), true, "");
    case "polarisation":
      // Consensus out of 100 (a whole number): the spread is the fall from one period to the next.
      if (!hasSeries || values.length !== 2 || change >= 0) return null;
      return build(t("sig_tl_polar"), change, "sig_tr_unit_cons", periodNames(s.periode, 2, lang), false);
    case "feble": {
      const m = s.descripcio.match(/decline of\s+([\d.]+)\s+points?\s+over\s+(\d+)\s+periods?/i);
      if (!m || Number(m[1]) === 0) return null;
      const delta = `−${dec(Number(m[1]).toFixed(1), lang)}`;
      const unit = t("sig_tr_unit");
      const label = t("sig_tl_weak");
      const per = t("sig_tr_weak_per", { p: m[2] });
      return { label, delta, unit, values: [], names: [], aria: `${label}: ${delta} ${unit} ${per}`, plain: `${label} · ${delta} ${unit} (${per})` };
    }
    default:
      return null;
  }
}

/** Plain one-line version for places that cannot hold markup (push body): trend line when the signal has one, else the sentence. */
export function signalPlain(s: Pick<SignalLike, "tipus" | "descripcio" | "periode">, lang: Lang = "ca"): string {
  return signalTrend(s, lang)?.plain ?? signalDetail(s, lang);
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
