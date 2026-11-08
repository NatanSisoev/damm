// Recommendation drafts for an open alarm. AI proposes, a human decides: every output is a proposal, nothing is tracked.
// Input is aggregate only (segment labels, score, n, confidence, insight summaries). No individual data, no comment quotes.
// Self-contained on purpose (no sibling imports) so the engine's demo and job scripts can run it with plain node.

/** Damm's own initiatives, as named in the challenge deck. */
export const DAMM_INITIATIVES = [
  "Conciliació i flexibilitat",
  "Formació i desenvolupament",
  "Igualtat i diversitat",
  "Seguretat i salut",
  "Comunicació i lideratge",
  "Salut i vida activa",
  "Compromís i beneficis socials",
] as const;
export type DammInitiative = (typeof DAMM_INITIATIVES)[number];

export interface RecInsight {
  /** importance_gap | segment_gap | polarisation | ... */
  kind: string;
  /** Short aggregate-only summary in plain words, e.g. "important però puntua baix (quadrant act_first)". */
  summary: string;
  /** importance_gap quadrant, when present. */
  quadrant?: string;
  /** segment_gap: label of the lowest-scoring shift. */
  lowestShift?: string | null;
}

export interface RecommendationContext {
  alarmType: string;
  severity: "info" | "warning" | "critical";
  domain: string;
  collective: string | null;
  shift: string | null;
  period: string;
  /** Score 0..10 and change vs the previous period; null when unknown. */
  score: number | null;
  change: number | null;
  n: number;
  /** 0..100 */
  confidence: number | null;
  insights: RecInsight[];
  /** Theme summaries from comment analysis, aggregate and already redacted. Optional. */
  themes?: string[];
}

export interface RecommendationProposal {
  title: string;
  /** The concrete action. */
  action: string;
  initiative: DammInitiative;
  /** Suggestions only, not tracked. */
  suggestedOwner: string;
  suggestedTimeframe: string;
  rationale: string;
  limits: string;
  source: "llm" | "template";
}

export interface DraftOptions {
  /** Overrides the LLM call (tests). Default: chatJson, used only when LLM_API_KEY and LLM_BASE_URL are set. */
  chat?: (system: string, user: string) => Promise<unknown>;
  /** Never call the LLM. */
  templateOnly?: boolean;
}

// ---- Template library --------------------------------------------------------------------------------------

interface Lever {
  title: string;
  action: string;
  initiative: DammInitiative;
  owner: string;
  timeframe: string;
}

const L = (title: string, action: string, initiative: DammInitiative, owner: string, timeframe: string): Lever => ({ title, action, initiative, owner, timeframe });

/** Domain-level levers, most useful first. {seg} is replaced by the segment label. */
const DOMAIN_LEVERS: Record<string, Lever[]> = {
  Benestar: [
    L("Pausa de microdescans a {seg}", "Pilotar 4 setmanes amb pauses curtes addicionals de 5 minuts cada 2 hores i un espai tranquil accessible, i revisar si la càrrega percebuda baixa en la propera enquesta.", "Salut i vida activa", "RRHH", "4 setmanes de pilot"),
    L("Sessions de salut i gestió de l'estrès", "Oferir dues sessions voluntàries de 30 minuts sobre gestió de l'estrès i del son, dins l'horari, amb el servei de prevenció.", "Salut i vida activa", "Prevenció", "Properes 6 setmanes"),
    L("Flexibilitat horària puntual", "Obrir un canal àgil per canviar torns o hores puntualment per motius personals, amb criteris públics i simples.", "Conciliació i flexibilitat", "RRHH", "Propers 2 mesos"),
  ],
  Lideratge: [
    L("Formació en conversa i feedback per a tota la línia de comandament", "Programa curt (2 x 2 h) de conversa d'equip, escolta i feedback obert a tota la línia de comandament, sense assenyalar ningú, amb casos pràctics i seguiment en grups petits.", "Comunicació i lideratge", "RRHH", "Propers 2 mesos"),
    L("Rutina d'escolta d'equip", "Proposar a tots els equips una reunió mensual de 15 minuts per comentar què funciona i què no, amb un registre agregat de temes que arriba a RRHH.", "Comunicació i lideratge", "RRHH", "Propers 30 dies"),
    L("Acompanyament entre iguals", "Crear cercles de 4-6 persones de comandament per compartir pràctiques de lideratge, facilitats per RRHH.", "Formació i desenvolupament", "RRHH", "Propers 3 mesos"),
  ],
  Desenvolupament: [
    L("Itineraris de formació visibles", "Publicar un mapa clar de formacions i rotacions disponibles per a {seg} i obrir una convocatòria trimestral amb criteris transparents.", "Formació i desenvolupament", "RRHH", "Propers 2 mesos"),
    L("Hores de formació protegides", "Reservar un bloc fix d'hores de formació al mes dins l'horari, planificat amb l'equip perquè no es perdi per la càrrega de feina.", "Formació i desenvolupament", "Cap d'equip", "Pròxim trimestre"),
    L("Converses de carrera", "Oferir una conversa anual de 30 minuts sobre expectatives i opcions de creixement, amb una guia comuna.", "Formació i desenvolupament", "RRHH", "Pròxims 3 mesos"),
  ],
  "Cultura i pertinença": [
    L("Reconeixement entre companys", "Posar en marxa un reconeixement mensual proposat pels mateixos equips, amb criteris clars i visible a {seg}.", "Compromís i beneficis socials", "RRHH", "Propers 30 dies"),
    L("Accions d'equip transversals", "Organitzar una trobada o acció conjunta entre equips o torns que normalment no coincideixen, dins l'horari laboral.", "Compromís i beneficis socials", "RRHH", "Propers 2 mesos"),
    L("Revisar l'acollida i la inclusió", "Revisar l'acollida de les persones noves i els canals d'inclusió per assegurar que cap torn o col·lectiu queda al marge.", "Igualtat i diversitat", "RRHH", "Pròxim trimestre"),
  ],
  "Entorn i relacions": [
    L("Espais de coordinació entre torns", "Establir un relleu curt i estructurat entre torns i una reunió mensual d'equip mixt per millorar la relació i evitar malentesos.", "Comunicació i lideratge", "Cap de torn", "Propers 30 dies"),
    L("Dinàmiques de col·laboració", "Fer un taller de 90 minuts sobre col·laboració i resolució de conflictes entre equips que treballen units.", "Comunicació i lideratge", "RRHH", "Propers 2 mesos"),
    L("Canal de resolució informal", "Donar a conèixer un canal confidencial i simple per plantejar friccions abans que escalin, amb tractament agregat.", "Igualtat i diversitat", "RRHH", "Propers 30 dies"),
  ],
  "Condicions i organització": [
    L("Revisar càrrega i planificació de {seg}", "Revisar amb l'equip la planificació de torns i càrrega setmanal, detectar els pics i acordar 2 ajustos concrets, comprovant l'efecte en la propera enquesta.", "Conciliació i flexibilitat", "Cap de torn", "Propers 30 dies"),
    L("Comunicar els torns amb més antelació", "Publicar els quadrants amb un mínim d'antelació acordat i explicar els canvis de torn i de pauses abans que s'apliquin.", "Comunicació i lideratge", "Cap de torn", "Propers 15 dies"),
    L("Revisar equipament i entorn físic", "Fer una ronda curta amb l'equip per identificar l'equipament, l'espai o les eines que dificulten la feina, i prioritzar-ne dues millores.", "Seguretat i salut", "Prevenció", "Propers 2 mesos"),
  ],
};

/** Collective × domain levers that sound specific to the work. They go first when available. */
const SPECIFIC: Record<string, Lever> = {
  "Logística|Condicions i organització": L(
    "Punts d'hidratació i pauses ajustades per calor a Logística",
    "Instal·lar punts d'aigua i ombra al moll i al magatzem, ajustar les pauses en les hores de més calor i revisar la ventilació i la roba i l'equipament de protecció per a temporada calorosa.",
    "Seguretat i salut",
    "Prevenció",
    "Properes 2 setmanes (mesures bàsiques), 2 mesos (revisió d'equipament)",
  ),
  "Fàbriques|Condicions i organització": L(
    "Revisió de rotació de tasques i pauses a Fàbriques",
    "Revisar la rotació de llocs repetitius i el calendari de pauses a línia amb els caps de torn i els representants de l'equip, i provar una rotació cada 2 hores en un torn pilot.",
    "Seguretat i salut",
    "Prevenció",
    "Pilot de 4 setmanes",
  ),
  "Comercial|Condicions i organització": L(
    "Acordar franges de desconnexió i planificació de visites",
    "Acordar franges de desconnexió fora de l'horari, agrupar les visites per zona i definir un màxim de desplaçaments per setmana.",
    "Conciliació i flexibilitat",
    "RRHH",
    "Propers 30 dies",
  ),
  "Oficines|Condicions i organització": L(
    "Teletreball flexible i reunions més curtes",
    "Fixar dos dies de teletreball flexible per equip, reunions de màxim 45 minuts i una franja diària sense reunions per a feina concentrada.",
    "Conciliació i flexibilitat",
    "RRHH",
    "Propers 30 dies",
  ),
  "Logística|Benestar": L(
    "Programa d'ergonomia i descans per a Logística",
    "Fer una avaluació ergonòmica dels llocs de càrrega manual, oferir formació breu de postures i garantir pauses recuperadores després dels esforços llargs.",
    "Seguretat i salut",
    "Prevenció",
    "Propers 2 mesos",
  ),
  "Fàbriques|Benestar": L(
    "Ergonomia i rotació de llocs a Fàbriques",
    "Avaluar ergonòmicament els llocs més repetitius, oferir estiraments guiats de 5 minuts a l'inici del torn i revisar el soroll i la il·luminació.",
    "Seguretat i salut",
    "Prevenció",
    "Propers 2 mesos",
  ),
  "Comercial|Benestar": L(
    "Càrrega comercial sostenible",
    "Revisar objectius i desplaçaments de l'equip comercial, i oferir una sessió sobre gestió del temps i de l'estrès amb suport de salut laboral.",
    "Salut i vida activa",
    "RRHH",
    "Propers 2 mesos",
  ),
  "Oficines|Benestar": L(
    "Reptes de salut i pauses actives a Oficines",
    "Proposar pauses actives de 5 minuts, un repte voluntari d'activitat física d'equip i accés a l'oferta de salut i vida activa de l'empresa.",
    "Salut i vida activa",
    "RRHH",
    "Propers 30 dies",
  ),
  "Logística|Entorn i relacions": L(
    "Relleu estructurat entre torns de Logística",
    "Introduir un relleu de 10 minuts entre torns amb una pissarra comuna d'incidències i una trobada mensual de tots els torns.",
    "Comunicació i lideratge",
    "Cap de torn",
    "Propers 30 dies",
  ),
};

// ---- Alarm-type framing ------------------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  sharp_drop: "una caiguda marcada respecte al període anterior",
  sustained_decline: "un descens sostingut durant diversos períodes",
  changepoint_cluster: "un grup de persones amb una caiguda confirmada",
  polarisation: "una opinió cada cop més dividida",
  feble: "un senyal feble però constant",
  low_confidence: "poca confiança estadística en la lectura",
  improvement: "una millora després d'una acció",
  baixa_participacio: "una participació baixa",
  emergent: "un tema emergent",
};

const PARTICIPATION_LEVERS: Lever[] = [
  L("Explicar què es fa amb les respostes", "Compartir amb l'equip, en una nota breu, què ha canviat gràcies a les últimes respostes i recordar l'anonimat i el mínim de grup; la gent respon més quan veu resultats.", "Comunicació i lideratge", "RRHH", "Propers 15 dies"),
  L("Moment i format de resposta adaptats", "Oferir el torn de resposta en una pausa o al final de la jornada, amb preguntes curtes, i recordar l'enllaç o el QR en els punts de pas de l'equip.", "Comunicació i lideratge", "Cap de torn", "Propers 15 dies"),
];

const CONSOLIDATE: Lever = L(
  "Consolidar el que ha funcionat",
  "Documentar què es va fer a {seg}, mantenir-ho 2 períodes més i valorar estendre'l a un segment comparable.",
  "Compromís i beneficis socials",
  "RRHH",
  "Pròxim trimestre",
);

const POLARISATION: Lever = L(
  "Escolta per subgrups abans d'actuar",
  "Abans d'una mesura general, fer 2 o 3 sessions d'escolta agregades (mínim 10 persones) per entendre què separa les opinions i dissenyar una acció que serveixi a tots els grups.",
  "Comunicació i lideratge",
  "RRHH",
  "Propers 30 dies",
);

const FOLLOW_UP = " Tanca el cercle amb una micro-enquesta de seguiment d'unes 3 preguntes al cap d'un mes.";

function seg(ctx: RecommendationContext): string {
  return [ctx.collective ?? "tota l'empresa", ctx.shift ? `torn ${ctx.shift === "mati" ? "matí" : ctx.shift}` : null].filter(Boolean).join(", ");
}

const fill = (s: string, ctx: RecommendationContext) => s.replace(/\{seg\}/g, seg(ctx));
const num = (x: number | null, d = 1) => (x === null ? "?" : x.toFixed(d).replace(".", ","));

function rationale(ctx: RecommendationContext): string {
  const bits = [
    `${TYPE_LABEL[ctx.alarmType] ?? "un senyal"} a ${ctx.domain} (${seg(ctx)}, ${ctx.period})`,
    ctx.score !== null ? `puntuació ${num(ctx.score)}/10` : null,
    ctx.change !== null ? `canvi respecte al període anterior ${ctx.change > 0 ? "+" : ""}${num(ctx.change)}` : null,
    `n = ${ctx.n}`,
    ctx.confidence !== null ? `confiança ${Math.round(ctx.confidence)}%` : null,
  ].filter(Boolean);
  const ins = ctx.insights.slice(0, 2).map((i) => i.summary.replace(/(\d)\.(\d)/g, "$1,$2"));
  const themes = (ctx.themes ?? []).slice(0, 2);
  const head = bits.join(", ");
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.${ins.length ? ` Context: ${ins.join("; ")}.` : ""}${themes.length ? ` Temes recurrents en els comentaris (agregats): ${themes.join("; ")}.` : ""}`;
}

function limits(ctx: RecommendationContext): string {
  const lowConf = ctx.confidence !== null && ctx.confidence < 60;
  return `Correlació, no causa: les dades mostren on i quan baixa la puntuació, no el motiu.${lowConf ? " La confiança és moderada, així que tracta-ho com una hipòtesi a contrastar." : ""} Només dades agregades (grups de 10 persones o més).`;
}

/** Template drafts: always available, no key needed. 1 to 3 proposals. */
export function templateRecommendations(ctx: RecommendationContext): RecommendationProposal[] {
  const levers: Lever[] = [];
  const specific = ctx.collective ? SPECIFIC[`${ctx.collective}|${ctx.domain}`] : undefined;
  const domain = DOMAIN_LEVERS[ctx.domain] ?? DOMAIN_LEVERS["Condicions i organització"]!;
  const hasGap = ctx.insights.some((i) => i.kind === "segment_gap" && i.lowestShift);
  const polar = ctx.alarmType === "polarisation" || ctx.insights.some((i) => i.kind === "polarisation");
  const actFirst = ctx.insights.some((i) => i.kind === "importance_gap" && i.quadrant === "act_first");

  if (ctx.alarmType === "low_confidence" || ctx.alarmType === "baixa_participacio") {
    levers.push(...PARTICIPATION_LEVERS);
    if (specific) levers.push(specific);
  } else if (ctx.alarmType === "improvement") {
    levers.push(CONSOLIDATE, domain[0]!);
  } else if (polar) {
    levers.push(POLARISATION, ...(specific ? [specific] : []), domain[0]!);
  } else {
    if (specific) levers.push(specific);
    levers.push(...domain);
  }
  // Rank is already by usefulness; an "act_first" domain keeps its specific action on top and adds the domain's first lever.
  const picked = levers.slice(0, ctx.severity === "critical" || actFirst ? 3 : 2);

  return picked.map((lv, i) => {
    let action = fill(lv.action, ctx);
    if (hasGap && i === 0) {
      const low = ctx.insights.find((x) => x.lowestShift)?.lowestShift;
      action += ` Comença pel torn ${low === "mati" ? "matí" : low}, que és on la puntuació és més baixa.`;
    }
    if (i === 0 && ctx.alarmType !== "improvement") action += FOLLOW_UP;
    return {
      title: fill(lv.title, ctx),
      action,
      initiative: lv.initiative,
      suggestedOwner: lv.owner,
      suggestedTimeframe: lv.timeframe,
      rationale: rationale(ctx),
      limits: limits(ctx),
      source: "template" as const,
    };
  });
}

// ---- LLM path ----------------------------------------------------------------------------------------------

const SYSTEM = `Ets un assessor de recursos humans d'una empresa cervesera (dades sintètiques). Respon NOMÉS amb un objecte JSON, en català.
Format: {"proposals": [{"title": string, "action": string, "initiative": string, "suggestedOwner": string, "suggestedTimeframe": string}]}
- Entre 1 i 3 propostes, concretes i accionables, adaptades al col·lectiu i al domini. Són suggeriments: RRHH decideix.
- "initiative" ha de ser exactament una d'aquestes: ${DAMM_INITIATIVES.join(" | ")}.
- No assenyalis cap persona ni cap cap/responsable concret. Mai demanis ni cites comentaris o dades individuals.
- No afirmis causes: només correlacions.`;

function userPrompt(ctx: RecommendationContext): string {
  return [
    `Alarma: ${ctx.alarmType} (${ctx.severity}) al domini ${ctx.domain}.`,
    `Segment: ${seg(ctx)}. Període ${ctx.period}. Puntuació ${num(ctx.score)}/10, canvi respecte al període anterior ${num(ctx.change)}, n=${ctx.n}, confiança ${ctx.confidence === null ? "?" : Math.round(ctx.confidence)}%.`,
    ctx.insights.length ? `Context agregat: ${ctx.insights.map((i) => i.summary).join("; ")}.` : null,
    ctx.themes?.length ? `Temes agregats: ${ctx.themes.join("; ")}.` : null,
  ].filter(Boolean).join("\n");
}

const str = (x: unknown, max: number): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);

function parseLlm(raw: unknown, ctx: RecommendationContext): RecommendationProposal[] {
  const list = (raw as { proposals?: unknown })?.proposals;
  if (!Array.isArray(list)) throw new Error("no proposals");
  const out: RecommendationProposal[] = [];
  for (const p of list.slice(0, 3) as Record<string, unknown>[]) {
    const title = str(p?.title, 120);
    const action = str(p?.action, 600);
    const initiative = DAMM_INITIATIVES.find((i) => i === p?.initiative);
    if (!title || !action || !initiative) continue;
    out.push({
      title,
      action,
      initiative,
      suggestedOwner: str(p.suggestedOwner, 60) ?? "RRHH",
      suggestedTimeframe: str(p.suggestedTimeframe, 80) ?? "Propers 30 dies",
      rationale: rationale(ctx),
      limits: limits(ctx),
      source: "llm",
    });
  }
  if (out.length === 0) throw new Error("no valid proposals");
  return out;
}

/**
 * Draft 1 to 3 recommendation proposals for an alarm. Uses the LLM only when a key is configured (or `chat` is given);
 * on any failure it falls back to the template library, so it never throws and never needs a key.
 */
export async function draftRecommendations(ctx: RecommendationContext, opts: DraftOptions = {}): Promise<RecommendationProposal[]> {
  const configured = !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
  if (!opts.templateOnly && (opts.chat || configured)) {
    try {
      const chat = opts.chat ?? (await import("./llm")).chatJson;
      return parseLlm(await chat(SYSTEM, userPrompt(ctx)), ctx);
    } catch {
      /* fall through to the template */
    }
  }
  return templateRecommendations(ctx);
}
