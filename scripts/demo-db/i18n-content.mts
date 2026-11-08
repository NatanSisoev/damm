// Trilingual (ca/es/en) content for the demo database build (scripts/build-demo-db.mts).
// Catalan is canonical in the DB; es and en go to `pregunta.text_i18n` and the `traduccio` overlay table.
// Synthetic, generic text only. Unknown strings are never guessed: they stay Catalan and are counted by `Misses`.

export type Lang = "ca" | "es" | "en";
export type Tri = { ca: string; es: string; en: string };

export class Misses {
  list: { kind: string; text: string }[] = [];
  add(kind: string, text: string) {
    this.list.push({ kind, text });
  }
}

// ---- names (same wording as apps/web/lib/i18n/names.ts) -----------------------------------------------------

export const DOMAIN: Record<string, Tri> = {
  "Benestar": { ca: "Benestar", es: "Bienestar", en: "Wellbeing" },
  "Lideratge": { ca: "Lideratge", es: "Liderazgo", en: "Leadership" },
  "Desenvolupament": { ca: "Desenvolupament", es: "Desarrollo", en: "Development" },
  "Cultura i pertinença": { ca: "Cultura i pertinença", es: "Cultura y pertenencia", en: "Culture and belonging" },
  "Entorn i relacions": { ca: "Entorn i relacions", es: "Entorno y relaciones", en: "Environment and relationships" },
  "Condicions i organització": { ca: "Condicions i organització", es: "Condiciones y organización", en: "Conditions and organisation" },
};
export const COLLECTIVE: Record<string, Tri> = {
  "Fàbriques": { ca: "Fàbriques", es: "Fábricas", en: "Factories" },
  "Logística": { ca: "Logística", es: "Logística", en: "Logistics" },
  "Comercial": { ca: "Comercial", es: "Comercial", en: "Sales" },
  "Oficines": { ca: "Oficines", es: "Oficinas", en: "Offices" },
};
export const SHIFT: Record<string, Tri> = {
  mati: { ca: "matí", es: "mañana", en: "morning" },
  tarda: { ca: "tarda", es: "tarde", en: "afternoon" },
  nit: { ca: "nit", es: "noche", en: "night" },
};
const WHOLE_COMPANY: Tri = { ca: "tota l'empresa", es: "toda la empresa", en: "the whole company" };

export const THEME_LABEL: Record<string, Tri> = {
  "Ambient d'equip": { ca: "Ambient d'equip", es: "Ambiente de equipo", en: "Team atmosphere" },
  "Formació": { ca: "Formació", es: "Formación", en: "Training" },
  "Col·laboració entre departaments": { ca: "Col·laboració entre departaments", es: "Colaboración entre departamentos", en: "Collaboration between departments" },
  "Comunicació interna": { ca: "Comunicació interna", es: "Comunicación interna", en: "Internal communication" },
  "Eines i sistemes": { ca: "Eines i sistemes", es: "Herramientas y sistemas", en: "Tools and systems" },
  "Conciliació i horaris": { ca: "Conciliació i horaris", es: "Conciliación y horarios", en: "Work-life balance and schedules" },
  "Carrera i promoció": { ca: "Carrera i promoció", es: "Carrera y promoción", en: "Career and promotion" },
  "Direcció i visió de futur": { ca: "Direcció i visió de futur", es: "Dirección y visión de futuro", en: "Direction and vision for the future" },
  "Relació amb el cap directe": { ca: "Relació amb el cap directe", es: "Relación con el jefe directo", en: "Relationship with direct manager" },
  "Comunicació del sistema de torns i pauses": {
    ca: "Comunicació del sistema de torns i pauses",
    es: "Comunicación del sistema de turnos y pausas",
    en: "Communication of the shift and break system",
  },
  "Càrrega de treball": { ca: "Càrrega de treball", es: "Carga de trabajo", en: "Workload" },
  "Cansament i descans": { ca: "Cansament i descans", es: "Cansancio y descanso", en: "Tiredness and rest" },
  "Reconeixement": { ca: "Reconeixement", es: "Reconocimiento", en: "Recognition" },
  "Calor i equips de protecció (EPI)": { ca: "Calor i equips de protecció (EPI)", es: "Calor y equipos de protección (EPI)", en: "Heat and protective equipment (PPE)" },
  "Temes sensibles (assetjament, seguretat personal)": {
    ca: "Temes sensibles (assetjament, seguretat personal)",
    es: "Temas sensibles (acoso, seguridad personal)",
    en: "Sensitive topics (harassment, personal safety)",
  },
};

// ---- theme summaries (tema.resum, a deterministic Catalan template in packages/engine/src/comments.ts) --------

const SENSITIVE_RESUM: Tri = {
  ca: "Hi ha comentaris sobre aquest tema. Per protegir les persones només es mostra el recompte agregat; si cal, cal adreçar-se al canal confidencial oficial.",
  es: "Hay comentarios sobre este tema. Para proteger a las personas solo se muestra el recuento agregado; si hace falta, hay que dirigirse al canal confidencial oficial.",
  en: "There are comments on this topic. To protect people only the aggregate count is shown; if needed, use the official confidential channel.",
};

const decimal = (s: string, lang: Lang) => (lang === "ca" ? s : s.replace(",", "."));

export function translateResum(ca: string, lang: Lang, misses: Misses): string {
  if (lang === "ca") return ca;
  if (ca === SENSITIVE_RESUM.ca) return SENSITIVE_RESUM[lang];
  const head = /^(\d+) comentaris \((\d+)% dels comentaris (?:a (.+?)|a tota l'empresa) aquest període\) parlen de «(.+?)»\. /.exec(ca);
  if (!head) {
    misses.add("resum", ca);
    return ca;
  }
  let rest = ca.slice(head[0].length);
  const [, n, pct, col, theme] = head;
  const colTr = col ? (COLLECTIVE[col]?.[lang] ?? col) : WHOLE_COMPANY[lang];
  const themeTr = THEME_LABEL[theme!]?.[lang] ?? theme!;
  if (!THEME_LABEL[theme!]) misses.add("resum-theme", theme!);

  let delta = "";
  let m: RegExpExecArray | null;
  if ((m = /^Tema emergent: puja ([\d,.]+) punts percentuals respecte al període anterior\. /.exec(rest))) {
    const d = decimal(m[1]!, lang);
    delta = lang === "es" ? `Tema emergente: sube ${d} puntos porcentuales respecto al período anterior.` : `Emerging theme: up ${d} percentage points on the previous period.`;
  } else if ((m = /^Creix ([\d,.]+) punts respecte al període anterior\. /.exec(rest))) {
    const d = decimal(m[1]!, lang);
    delta = lang === "es" ? `Crece ${d} puntos respecto al período anterior.` : `Up ${d} points on the previous period.`;
  } else if ((m = /^Baixa ([\d,.]+) punts respecte al període anterior\. /.exec(rest))) {
    const d = decimal(m[1]!, lang);
    delta = lang === "es" ? `Baja ${d} puntos respecto al período anterior.` : `Down ${d} points on the previous period.`;
  } else if ((m = /^Es manté estable respecte al període anterior\. /.exec(rest))) {
    delta = lang === "es" ? "Se mantiene estable respecto al período anterior." : "Stable compared with the previous period.";
  } else if ((m = /^No hi ha període anterior comparable\. /.exec(rest))) {
    delta = lang === "es" ? "No hay período anterior comparable." : "No comparable previous period.";
  } else {
    misses.add("resum-delta", rest);
    return ca;
  }
  rest = rest.slice(m[0].length);

  let co = "";
  if ((m = /^Sovint apareix juntament amb: (.+?)\. (?=Resum automàtic)/.exec(rest))) {
    const names = [...m[1]!.matchAll(/«(.+?)»/g)].map((x) => THEME_LABEL[x[1]!]?.[lang] ?? x[1]!);
    co = lang === "es" ? ` A menudo aparece junto con: ${names.map((x) => `«${x}»`).join(", ")}.` : ` Often appears together with: ${names.map((x) => `“${x}”`).join(", ")}.`;
    rest = rest.slice(m[0].length);
  }
  if (rest !== "Resum automàtic a partir de recomptes; no reprodueix cap comentari.") {
    misses.add("resum-tail", rest);
    return ca;
  }
  const tail = lang === "es" ? "Resumen automático a partir de recuentos; no reproduce ningún comentario." : "Automatic summary based on counts; it does not reproduce any comment.";
  return lang === "es"
    ? `${n} comentarios (${pct}% de los comentarios en ${colTr} este período) hablan de «${themeTr}». ${delta}${co} ${tail}`
    : `${n} comments (${pct}% of comments in ${colTr} this period) are about “${themeTr}”. ${delta}${co} ${tail}`;
}

// ---- recommendations (packages/ai/src/recommendations.ts templates) ------------------------------------------

// Placeholders: {C} collective, {T} shift. Segments are substituted before lookup and restored after.
const REC_TEXT: Record<string, Tri> = {
  "Fer un taller de 90 minuts sobre col·laboració i resolució de conflictes entre equips que treballen units.": {
    ca: "",
    es: "Hacer un taller de 90 minutos sobre colaboración y resolución de conflictos entre equipos que trabajan juntos.",
    en: "Hold a 90-minute workshop on collaboration and conflict resolution between teams that work together.",
  },
  "Fer una ronda curta amb l'equip per identificar l'equipament, l'espai o les eines que dificulten la feina, i prioritzar-ne dues millores.": {
    ca: "",
    es: "Hacer una ronda corta con el equipo para identificar el equipamiento, el espacio o las herramientas que dificultan el trabajo, y priorizar dos mejoras.",
    en: "Do a short round with the team to identify the equipment, space or tools that get in the way of work, and prioritise two improvements.",
  },
  "Abans d'una mesura general, fer 2 o 3 sessions d'escolta agregades (mínim 10 persones) per entendre què separa les opinions i dissenyar una acció que serveixi a tots els grups.": {
    ca: "",
    es: "Antes de una medida general, hacer 2 o 3 sesiones de escucha agregadas (mínimo 10 personas) para entender qué separa las opiniones y diseñar una acción que sirva a todos los grupos.",
    en: "Before a general measure, hold 2 or 3 aggregated listening sessions (at least 10 people) to understand what divides opinions and design an action that works for every group.",
  },
  "Compartir amb l'equip, en una nota breu, què ha canviat gràcies a les últimes respostes i recordar l'anonimat i el mínim de grup; la gent respon més quan veu resultats.": {
    ca: "",
    es: "Compartir con el equipo, en una nota breve, qué ha cambiado gracias a las últimas respuestas y recordar el anonimato y el mínimo de grupo; la gente responde más cuando ve resultados.",
    en: "Share with the team, in a short note, what has changed thanks to the latest answers and remind them of anonymity and the minimum group size; people answer more when they see results.",
  },
  "Crear cercles de 4-6 persones de comandament per compartir pràctiques de lideratge, facilitats per RRHH.": {
    ca: "",
    es: "Crear círculos de 4-6 personas de mando para compartir prácticas de liderazgo, facilitados por RRHH.",
    en: "Create circles of 4-6 people in management roles to share leadership practices, facilitated by HR.",
  },
  "Documentar què es va fer a {C}, mantenir-ho 2 períodes més i valorar estendre'l a un segment comparable.": {
    ca: "",
    es: "Documentar qué se hizo en {C}, mantenerlo 2 períodos más y valorar extenderlo a un segmento comparable.",
    en: "Document what was done in {C}, keep it going for 2 more periods and consider extending it to a comparable segment.",
  },
  "Establir un relleu curt i estructurat entre torns i una reunió mensual d'equip mixt per millorar la relació i evitar malentesos.": {
    ca: "",
    es: "Establecer un relevo corto y estructurado entre turnos y una reunión mensual de equipo mixto para mejorar la relación y evitar malentendidos.",
    en: "Set up a short, structured handover between shifts and a monthly mixed-team meeting to improve relationships and avoid misunderstandings.",
  },
  "Introduir un relleu de 10 minuts entre torns amb una pissarra comuna d'incidències i una trobada mensual de tots els torns.": {
    ca: "",
    es: "Introducir un relevo de 10 minutos entre turnos con una pizarra común de incidencias y un encuentro mensual de todos los turnos.",
    en: "Introduce a 10-minute handover between shifts with a shared incident board and a monthly meeting of all shifts.",
  },
  "Oferir el torn de resposta en una pausa o al final de la jornada, amb preguntes curtes, i recordar l'enllaç o el QR en els punts de pas de l'equip.": {
    ca: "",
    es: "Ofrecer el turno de respuesta en una pausa o al final de la jornada, con preguntas cortas, y recordar el enlace o el QR en los puntos de paso del equipo.",
    en: "Offer answering time during a break or at the end of the shift, with short questions, and show the link or QR code where the team passes by.",
  },
  "Oferir una conversa anual de 30 minuts sobre expectatives i opcions de creixement, amb una guia comuna.": {
    ca: "",
    es: "Ofrecer una conversación anual de 30 minutos sobre expectativas y opciones de crecimiento, con una guía común.",
    en: "Offer a 30-minute yearly conversation about expectations and growth options, with a common guide.",
  },
  "Programa curt (2 x 2 h) de conversa d'equip, escolta i feedback obert a tota la línia de comandament, sense assenyalar ningú, amb casos pràctics i seguiment en grups petits.": {
    ca: "",
    es: "Programa corto (2 x 2 h) de conversación de equipo, escucha y feedback abierto a toda la línea de mando, sin señalar a nadie, con casos prácticos y seguimiento en grupos pequeños.",
    en: "Short programme (2 x 2 h) on team conversation, listening and feedback, open to the whole management line, without singling anyone out, with practical cases and follow-up in small groups.",
  },
  "Proposar a tots els equips una reunió mensual de 15 minuts per comentar què funciona i què no, amb un registre agregat de temes que arriba a RRHH.": {
    ca: "",
    es: "Proponer a todos los equipos una reunión mensual de 15 minutos para comentar qué funciona y qué no, con un registro agregado de temas que llega a RRHH.",
    en: "Propose to every team a 15-minute monthly meeting to discuss what works and what does not, with an aggregated record of topics that reaches HR.",
  },
  "Publicar els quadrants amb un mínim d'antelació acordat i explicar els canvis de torn i de pauses abans que s'apliquin.": {
    ca: "",
    es: "Publicar los cuadrantes con una antelación mínima acordada y explicar los cambios de turno y de pausas antes de que se apliquen.",
    en: "Publish the rotas with an agreed minimum notice and explain shift and break changes before they take effect.",
  },
  "Publicar un mapa clar de formacions i rotacions disponibles per a {C} i obrir una convocatòria trimestral amb criteris transparents.": {
    ca: "",
    es: "Publicar un mapa claro de formaciones y rotaciones disponibles para {C} y abrir una convocatoria trimestral con criterios transparentes.",
    en: "Publish a clear map of the training and rotations available to {C} and open a quarterly call with transparent criteria.",
  },
  "Avaluar ergonòmicament els llocs més repetitius, oferir estiraments guiats de 5 minuts a l'inici del torn i revisar el soroll i la il·luminació.": {
    ca: "",
    es: "Evaluar ergonómicamente los puestos más repetitivos, ofrecer estiramientos guiados de 5 minutos al inicio del turno y revisar el ruido y la iluminación.",
    en: "Run an ergonomic assessment of the most repetitive workstations, offer guided 5-minute stretches at the start of the shift and review noise and lighting.",
  },
  "Pilotar 4 setmanes amb pauses curtes addicionals de 5 minuts cada 2 hores i un espai tranquil accessible, i revisar si la càrrega percebuda baixa en la propera enquesta.": {
    ca: "",
    es: "Pilotar 4 semanas con pausas cortas adicionales de 5 minutos cada 2 horas y un espacio tranquilo accesible, y revisar si la carga percibida baja en la próxima encuesta.",
    en: "Pilot for 4 weeks with extra 5-minute short breaks every 2 hours and an accessible quiet space, and check whether perceived load drops in the next survey.",
  },
  "Publicar un mapa clar de formacions i rotacions disponibles per a {C}, torn {T} i obrir una convocatòria trimestral amb criteris transparents.": {
    ca: "",
    es: "Publicar un mapa claro de formaciones y rotaciones disponibles para {C}, turno {T} y abrir una convocatoria trimestral con criterios transparentes.",
    en: "Publish a clear map of the training and rotations available for {C}, {T} shift, and open a quarterly call with transparent criteria.",
  },
  "Reservar un bloc fix d'hores de formació al mes dins l'horari, planificat amb l'equip perquè no es perdi per la càrrega de feina.": {
    ca: "",
    es: "Reservar un bloque fijo de horas de formación al mes dentro del horario, planificado con el equipo para que no se pierda por la carga de trabajo.",
    en: "Reserve a fixed block of training hours each month within working time, planned with the team so it is not lost to workload.",
  },
  "Revisar amb l'equip la planificació de torns i càrrega setmanal, detectar els pics i acordar 2 ajustos concrets, comprovant l'efecte en la propera enquesta.": {
    ca: "",
    es: "Revisar con el equipo la planificación de turnos y la carga semanal, detectar los picos y acordar 2 ajustes concretos, comprobando el efecto en la próxima encuesta.",
    en: "Review shift planning and weekly load with the team, spot the peaks and agree 2 concrete adjustments, checking the effect in the next survey.",
  },
  "Revisar la rotació de llocs repetitius i el calendari de pauses a línia amb els caps de torn i els representants de l'equip, i provar una rotació cada 2 hores en un torn pilot.": {
    ca: "",
    es: "Revisar la rotación de puestos repetitivos y el calendario de pausas en línea con los jefes de turno y los representantes del equipo, y probar una rotación cada 2 horas en un turno piloto.",
    en: "Review the rotation of repetitive tasks and the break schedule on the line with shift leads and team representatives, and trial a rotation every 2 hours on a pilot shift.",
  },
};

const REC_TITLE: Record<string, Tri> = {
  "Ergonomia i rotació de llocs a {C}": { ca: "", es: "Ergonomía y rotación de puestos en {C}", en: "Ergonomics and job rotation in {C}" },
  "Pausa de microdescans a {C}, torn {T}": { ca: "", es: "Pausa de microdescansos en {C}, turno {T}", en: "Micro-break pause in {C}, {T} shift" },
  "Dinàmiques de col·laboració": { ca: "", es: "Dinámicas de colaboración", en: "Collaboration dynamics" },
  "Revisar càrrega i planificació de tota l'empresa": { ca: "", es: "Revisar carga y planificación de toda la empresa", en: "Review workload and planning across the whole company" },
  "Revisar equipament i entorn físic": { ca: "", es: "Revisar equipamiento y entorno físico", en: "Review equipment and physical environment" },
  "Acompanyament entre iguals": { ca: "", es: "Acompañamiento entre iguales", en: "Peer support" },
  "Comunicar els torns amb més antelació": { ca: "", es: "Comunicar los turnos con más antelación", en: "Communicate shifts with more notice" },
  "Consolidar el que ha funcionat": { ca: "", es: "Consolidar lo que ha funcionado", en: "Consolidate what has worked" },
  "Converses de carrera": { ca: "", es: "Conversaciones de carrera", en: "Career conversations" },
  "Escolta per subgrups abans d'actuar": { ca: "", es: "Escucha por subgrupos antes de actuar", en: "Listen by subgroup before acting" },
  "Espais de coordinació entre torns": { ca: "", es: "Espacios de coordinación entre turnos", en: "Coordination spaces between shifts" },
  "Explicar què es fa amb les respostes": { ca: "", es: "Explicar qué se hace con las respuestas", en: "Explain what is done with the answers" },
  "Formació en conversa i feedback per a tota la línia de comandament": {
    ca: "",
    es: "Formación en conversación y feedback para toda la línea de mando",
    en: "Conversation and feedback training for the whole management line",
  },
  "Hores de formació protegides": { ca: "", es: "Horas de formación protegidas", en: "Protected training hours" },
  "Itineraris de formació visibles": { ca: "", es: "Itinerarios de formación visibles", en: "Visible training pathways" },
  "Moment i format de resposta adaptats": { ca: "", es: "Momento y formato de respuesta adaptados", en: "Answering time and format adapted to the team" },
  "Relleu estructurat entre torns de {C}": { ca: "", es: "Relevo estructurado entre turnos de {C}", en: "Structured handover between {C} shifts" },
  "Revisar càrrega i planificació de {C}": { ca: "", es: "Revisar carga y planificación de {C}", en: "Review workload and planning in {C}" },
  "Revisar càrrega i planificació de {C}, torn {T}": { ca: "", es: "Revisar carga y planificación de {C}, turno {T}", en: "Review workload and planning in {C}, {T} shift" },
  "Revisió de rotació de tasques i pauses a {C}": { ca: "", es: "Revisión de la rotación de tareas y pausas en {C}", en: "Review of task rotation and breaks in {C}" },
  "Rutina d'escolta d'equip": { ca: "", es: "Rutina de escucha de equipo", en: "Team listening routine" },
};

const INITIATIVE: Record<string, Tri> = {
  "Seguretat i salut": { ca: "", es: "Seguridad y salud", en: "Safety and health" },
  "Salut i vida activa": { ca: "", es: "Salud y vida activa", en: "Health and active living" },
  "Conciliació i flexibilitat": { ca: "", es: "Conciliación y flexibilidad", en: "Work-life balance and flexibility" },
  "Comunicació i lideratge": { ca: "", es: "Comunicación y liderazgo", en: "Communication and leadership" },
  "Formació i desenvolupament": { ca: "", es: "Formación y desarrollo", en: "Training and development" },
  "Compromís i beneficis socials": { ca: "", es: "Compromiso y beneficios sociales", en: "Engagement and social benefits" },
};
const OWNER: Record<string, Tri> = {
  "Prevenció": { ca: "", es: "Prevención", en: "Prevention" },
  "Cap de torn": { ca: "", es: "Jefe de turno", en: "Shift lead" },
  "RRHH": { ca: "", es: "RRHH", en: "HR" },
  "Cap d'equip": { ca: "", es: "Jefe de equipo", en: "Team lead" },
};
const TIMEFRAME: Record<string, Tri> = {
  "Pilot de 4 setmanes": { ca: "", es: "Piloto de 4 semanas", en: "4-week pilot" },
  "4 setmanes de pilot": { ca: "", es: "Piloto de 4 semanas", en: "4-week pilot" },
  "Propers 30 dies": { ca: "", es: "Próximos 30 días", en: "Next 30 days" },
  "Propers 15 dies": { ca: "", es: "Próximos 15 días", en: "Next 15 days" },
  "Propers 2 mesos": { ca: "", es: "Próximos 2 meses", en: "Next 2 months" },
  "Propers 3 mesos": { ca: "", es: "Próximos 3 meses", en: "Next 3 months" },
  "Pròxim trimestre": { ca: "", es: "Próximo trimestre", en: "Next quarter" },
  "Pròxims 3 mesos": { ca: "", es: "Próximos 3 meses", en: "Next 3 months" },
};

const FOLLOW_UP_CA = " Tanca el cercle amb una micro-enquesta de seguiment d'unes 3 preguntes al cap d'un mes.";
const FOLLOW_UP: Tri = {
  ca: FOLLOW_UP_CA,
  es: " Cierra el círculo con una microencuesta de seguimiento de unas 3 preguntas al cabo de un mes.",
  en: " Close the loop with a short follow-up survey of about 3 questions after a month.",
};
const START_SHIFT = /^ Comença pel torn (mati|tarda|nit), que és on la puntuació és més baixa\.$/;
const START_SHIFT_TR = (lang: Lang, t: string) =>
  lang === "es" ? ` Empieza por el turno de ${SHIFT[t]!.es}, que es donde la puntuación es más baja.` : ` Start with the ${SHIFT[t]!.en} shift, where the score is lowest.`;

const LIMITS: Record<string, Tri> = {
  "Correlació, no causa: les dades mostren on i quan baixa la puntuació, no el motiu. Només dades agregades (grups de 10 persones o més).": {
    ca: "",
    es: "Correlación, no causa: los datos muestran dónde y cuándo baja la puntuación, no el motivo. Solo datos agregados (grupos de 10 personas o más).",
    en: "Correlation, not causation: the data show where and when the score drops, not why. Aggregated data only (groups of 10 people or more).",
  },
  "Correlació, no causa: les dades mostren on i quan baixa la puntuació, no el motiu. La confiança és moderada, així que tracta-ho com una hipòtesi a contrastar. Només dades agregades (grups de 10 persones o més).": {
    ca: "",
    es: "Correlación, no causa: los datos muestran dónde y cuándo baja la puntuación, no el motivo. La confianza es moderada, así que trátalo como una hipótesis a contrastar. Solo datos agregados (grupos de 10 personas o más).",
    en: "Correlation, not causation: the data show where and when the score drops, not why. Confidence is moderate, so treat this as a hypothesis to test. Aggregated data only (groups of 10 people or more).",
  },
};

const LEAD: Record<string, Tri> = {
  "una caiguda marcada respecte al període anterior": { ca: "", es: "una caída marcada respecto al período anterior", en: "a sharp drop on the previous period" },
  "un descens sostingut durant diversos períodes": { ca: "", es: "un descenso sostenido durante varios períodos", en: "a sustained decline over several periods" },
  "un grup de persones amb una caiguda confirmada": { ca: "", es: "un grupo de personas con una caída confirmada", en: "a group of people with a confirmed drop" },
  "una opinió cada cop més dividida": { ca: "", es: "una opinión cada vez más dividida", en: "an increasingly divided opinion" },
  "un senyal feble però constant": { ca: "", es: "una señal débil pero constante", en: "a weak but steady signal" },
  "poca confiança estadística en la lectura": { ca: "", es: "poca confianza estadística en la lectura", en: "low statistical confidence in the reading" },
  "una millora després d'una acció": { ca: "", es: "una mejora tras una acción", en: "an improvement after an action" },
  "una participació baixa": { ca: "", es: "una participación baja", en: "low participation" },
  "un tema emergent": { ca: "", es: "un tema emergente", en: "an emerging theme" },
  "un senyal": { ca: "", es: "una señal", en: "a signal" },
};

const trKey = (map: Record<string, Tri>, ca: string, lang: Lang, misses: Misses, kind: string): string => {
  const hit = map[ca];
  if (!hit) {
    misses.add(kind, ca);
    return ca;
  }
  return lang === "ca" ? ca : hit[lang];
};

/** Replace collective/shift names by placeholders so a template lookup works; returns the template and the values. */
function templatise(ca: string): { tpl: string; c?: string; t?: string } {
  let c: string | undefined;
  let t: string | undefined;
  let tpl = ca.replace(/\b(Fàbriques|Logística|Comercial|Oficines)\b/g, (m) => ((c ??= m), "{C}"));
  tpl = tpl.replace(/torn (mati|tarda|nit)\b/g, (_m, s: string) => ((t ??= s), "torn {T}"));
  return { tpl, c, t };
}
const fillSeg = (s: string, lang: Lang, c?: string, t?: string) =>
  s.replace(/\{C\}/g, c ? COLLECTIVE[c]![lang] : "").replace(/\{T\}/g, t ? SHIFT[t]![lang] : "");

export function translateRecTitle(ca: string, lang: Lang, misses: Misses): string {
  if (lang === "ca") return ca;
  const { tpl, c, t } = templatise(ca);
  const hit = REC_TITLE[tpl];
  if (!hit) {
    misses.add("rec-titol", ca);
    return ca;
  }
  return fillSeg(hit[lang], lang, c, t);
}

export function translateRecText(ca: string, lang: Lang, misses: Misses): string {
  if (lang === "ca") return ca;
  let s = ca;
  let follow = false;
  if (s.endsWith(FOLLOW_UP_CA)) {
    follow = true;
    s = s.slice(0, -FOLLOW_UP_CA.length);
  }
  let startShift = "";
  const sm = /( Comença pel torn (mati|tarda|nit), que és on la puntuació és més baixa\.)$/.exec(s);
  if (sm) {
    startShift = START_SHIFT_TR(lang, sm[2]!);
    s = s.slice(0, -sm[1]!.length);
  }
  const { tpl, c, t } = templatise(s);
  const hit = REC_TEXT[tpl];
  if (!hit) {
    misses.add("rec-text", ca);
    return ca;
  }
  return fillSeg(hit[lang], lang, c, t) + startShift + (follow ? FOLLOW_UP[lang] : "");
}

const trCtx = (ca: string, lang: Lang, misses: Misses): string => {
  const es = lang === "es";
  const g = /^diferència de (-?[\d.]+) punts entre torns(?:, el més baix és (mati|tarda|nit))?; diferència de (-?[\d.]+) punts entre torns$/.exec(ca);
  if (g) {
    const low = g[2] ? (es ? `, el más bajo es ${SHIFT[g[2]]!.es}` : `, lowest is ${SHIFT[g[2]]!.en}`) : "";
    return es
      ? `diferencia de ${g[1]} puntos entre turnos${low}; diferencia de ${g[3]} puntos entre turnos`
      : `${g[1]} points gap between shifts${low}; ${g[3]} points gap between shifts`;
  }
  const m = /^el domini és (dels més importants per al col·lectiu i puntua baix|important i puntua bé|poc prioritari i puntua baix|poc prioritari i puntua bé|poc prioritari); (?:diferència de (-?[\d.]+) punts entre torns(?:, el més baix és (mati|tarda|nit))?(?:; diferència de (-?[\d.]+) punts entre torns)?|el consens ha caigut ([\d.]+) punts amb la puntuació gairebé estable)$/.exec(ca);
  if (!m) {
    misses.add("rec-context", ca);
    return ca;
  }
  const IMP: Record<string, Tri> = {
    "dels més importants per al col·lectiu i puntua baix": { ca: "", es: "es de los más importantes para el colectivo y puntúa bajo", en: "is among the most important for the collective and scores low" },
    "important i puntua bé": { ca: "", es: "es importante y puntúa bien", en: "is important and scores well" },
    "poc prioritari i puntua baix": { ca: "", es: "es poco prioritario y puntúa bajo", en: "is a low priority and scores low" },
    "poc prioritari i puntua bé": { ca: "", es: "es poco prioritario y puntúa bien", en: "is a low priority and scores well" },
    "poc prioritari": { ca: "", es: "es poco prioritario", en: "is a low priority" },
  };
  const imp = IMP[m[1]!]![lang as "es" | "en"];
  const head = es ? `el dominio ${imp}` : `the domain ${imp}`;
  if (m[4]) return es ? `${head}; el consenso ha caído ${m[4]} puntos con la puntuación casi estable` : `${head}; consensus has dropped ${m[4]} points while the score is almost stable`;
  const low = m[3] ? (es ? `, el más bajo es ${SHIFT[m[3]]!.es}` : `, lowest is ${SHIFT[m[3]]!.en}`) : "";
  const extra = m[5] ? (es ? `; diferencia de ${m[5]} puntos entre turnos` : `; ${m[5]} points gap between shifts`) : "";
  return es ? `${head}; diferencia de ${m[2]} puntos entre turnos${low}${extra}` : `${head}; ${m[2]} points gap between shifts${low}${extra}`;
};

export function translateRecRationale(ca: string, lang: Lang, misses: Misses): string {
  if (lang === "ca") return ca;
  // "{lead} a {Domini} ({Col}[, torn X], {period}), puntuació N/10, canvi ±N, n = N[, confiança N%]. [Context: …] [Temes recurrents …]"
  const m = /^(.+?) a (.+?) \((.+?), (\d{4}-\d{2})\)((?:, [^.]*?)*)\.(?: Context: (.+?)\.)?(?: Temes recurrents en els comentaris \(agregats\): (.+?)\.)?$/.exec(ca);
  if (!m) {
    misses.add("rec-justificacio", ca);
    return ca;
  }
  const [, lead, domain, seg, period, bitsRaw, ctxRaw, themesRaw] = m;
  const leadTr = trKey(LEAD, lead!, lang, misses, "rec-lead");
  const domainTr = DOMAIN[domain!]?.[lang] ?? domain!;
  if (!DOMAIN[domain!]) misses.add("rec-domain", domain!);
  const segTr = seg!
    .split(", ")
    .map((p) => {
      if (COLLECTIVE[p]) return COLLECTIVE[p]![lang];
      if (p === "tota l'empresa") return WHOLE_COMPANY[lang];
      const sh = /^torn (mati|tarda|nit)$/.exec(p);
      if (sh) return lang === "es" ? `turno ${SHIFT[sh[1]!]!.es}` : `${SHIFT[sh[1]!]!.en} shift`;
      misses.add("rec-seg", p);
      return p;
    })
    .join(", ");
  const bits = bitsRaw!
    .split(", ")
    .filter(Boolean)
    .map((b) => {
      let x: RegExpExecArray | null;
      if ((x = /^puntuació (.+)$/.exec(b))) return lang === "es" ? `puntuación ${decimal(x[1]!, lang) === x[1] ? x[1] : x[1]!.replace(",", ",")}` : `score ${x[1]!.replace(",", ".")}`;
      if ((x = /^canvi (.+)$/.exec(b))) return lang === "es" ? `cambio ${x[1]}` : `change ${x[1]!.replace(",", ".")}`;
      if (/^n = \d+$/.test(b)) return b;
      if ((x = /^confiança (\d+%)$/.exec(b))) return lang === "es" ? `confianza ${x[1]}` : `confidence ${x[1]}`;
      misses.add("rec-bit", b);
      return b;
    });
  const connector = lang === "es" ? " en " : " in ";
  let out = `${leadTr[0]!.toUpperCase()}${leadTr.slice(1)}${connector}${domainTr} (${segTr}, ${period})${bits.length ? ", " + bits.join(", ") : ""}.`;
  if (ctxRaw) out += ` ${lang === "es" ? "Contexto" : "Context"}: ${trCtx(ctxRaw, lang, misses)}.`;
  if (themesRaw)
    out += ` ${lang === "es" ? "Temas recurrentes en los comentarios (agregados)" : "Recurring themes in the comments (aggregated)"}: ${themesRaw
      .split("; ")
      .map((th) => THEME_LABEL[th]?.[lang] ?? (misses.add("rec-theme", th), th))
      .join("; ")}.`;
  return out;
}

// ---- demo-specific content (the HR need, the adopted recommendation, the context event, the signal) ---------------

export const NEED = {
  text_nl: {
    ca: "Volem saber com es comunica als centres de fabricació els canvis de torn.",
    es: "Queremos saber cómo se comunican en los centros de fabricación los cambios de turno.",
    en: "We want to know how well shift changes are being communicated in the factories.",
  } as Tri,
  titol: { ca: "Comunicació dels canvis de torn", es: "Comunicación de los cambios de turno", en: "Communication of shift changes" } as Tri,
  intro: {
    ca: "Ajuda'ns a entendre si t'avisen a temps i amb prou claredat quan canvia el teu torn.",
    es: "Ayúdanos a entender si te avisan a tiempo y con suficiente claridad cuando cambia tu turno.",
    en: "Help us understand whether you are told in good time, and clearly enough, when your shift changes.",
  } as Tri,
  questions: [
    {
      type: "yes_no",
      text: {
        ca: "Aquest mes, t'han avisat a temps dels canvis del teu torn?",
        es: "Este mes, ¿te han avisado a tiempo de los cambios de tu turno?",
        en: "This month, were you told about changes to your shift in good time?",
      } as Tri,
    },
    {
      type: "scale5",
      text: {
        ca: "Com de clara és la comunicació sobre els canvis de torn?",
        es: "¿Qué tan clara es la comunicación sobre los cambios de turno?",
        en: "How clear is the communication about shift changes?",
      } as Tri,
    },
  ],
};

export const ADOPTED_REC: Tri = {
  ca: "Revisar el calendari de torns del moll de càrrega i publicar-lo amb dues setmanes d'antelació.",
  es: "Revisar el calendario de turnos del muelle de carga y publicarlo con dos semanas de antelación.",
  en: "Review the loading-bay rota and publish it two weeks ahead.",
};
export const CONTEXT_EVENT: Tri = {
  ca: "Nou sistema de torns a les fàbriques",
  es: "Nuevo sistema de turnos en las fábricas",
  en: "New shift system in the factories",
};
export const SIGNAL_DESC: Tri = {
  ca: "Condicions i organització es manté baixa a Logística.",
  es: "Condiciones y organización se mantiene baja en Logística.",
  en: "Conditions and organisation stays low in Logistics.",
};

// ---- comment pools (employee comments), one per language -----------------------------------------------------
// Themed comments keep lexicon keywords (packages/engine/src/comments-lexicon.ts) so the planted themes are detected in every language.

type Tone = "negative" | "neutral" | "positive";
export type CommentPool = {
  COMMENTS: Record<number, Record<Tone, string[]>>;
  THEME_COMMENTS: { collectiuId: number; domainId: number; from: string; texts: string[] }[];
};

export const CA_POOL: CommentPool = {
  COMMENTS: {
    1: {
      negative: ["Acabo la majoria de setmanes esgotat.", "Hi ha massa pressió per arribar als objectius, no hi ha temps per respirar.", "Em costa molt desconnectar després de la feina.", "La càrrega de feina no para de créixer i ningú diu res."],
      neutral: ["Algunes setmanes van bé i d'altres són molt pesades.", "Depèn molt del període.", "Més pauses ajudarien."],
      positive: ["Em sento bé, el ritme és raonable.", "Últimament la càrrega de feina està més equilibrada.", "Puc desconnectar bé després de la feina."],
    },
    2: {
      negative: ["El meu cap no ens escolta quan plantegem problemes.", "Les decisions arriben des de dalt sense cap explicació.", "No hi ha feedback si no és que alguna cosa va malament.", "No confio en com es prenen les decisions a la meva àrea."],
      neutral: ["Depèn de qui mana aquell dia.", "Només parlem quan hi ha un problema.", "La comunicació amb la direcció podria ser més clara."],
      positive: ["El meu cap és proper i just.", "Rebem feedback útil i de manera regular.", "Em sento recolzat pel meu cap."],
    },
    3: {
      negative: ["Aquí no hi ha cap oportunitat real de créixer.", "La formació és sempre la mateixa i no serveix.", "Els criteris de promoció no són gens clars.", "Fa anys que faig les mateixes tasques."],
      neutral: ["Una mica de formació aniria bé.", "Les oportunitats existeixen però cal buscar-les.", "M'agradaria aprendre més sobre altres àrees."],
      positive: ["L'últim curs va ser molt útil.", "Aquest any he après molt.", "Veig com puc anar pujant aquí."],
    },
    4: {
      negative: ["La feina ben feta no es reconeix.", "Les novetats de l'empresa sempre ens arriben tard.", "No sento que sigui part de l'empresa.", "Sembla que hi ha dues empreses: les oficines centrals i la resta."],
      neutral: ["De vegades em sento part de l'empresa i de vegades no.", "La comunicació va millorant a poc a poc.", "Més trobades amb altres equips ajudarien."],
      positive: ["Estic orgullós de treballar aquí.", "Em sento part de l'equip i de l'empresa.", "Els valors de l'empresa em queden clars."],
    },
    5: {
      negative: ["Hi ha tensió a l'equip que ningú aborda.", "Els conflictes no es gestionen amb justícia.", "La coordinació amb altres departaments és dolenta.", "Algunes persones no són tractades amb respecte."],
      neutral: ["Bé amb alguns companys, més difícil amb d'altres.", "Treballem en silos.", "L'ambient canvia molt d'una setmana a l'altra."],
      positive: ["Molt bon ambient al meu equip.", "Puc ser jo mateix a la feina.", "Ens ajudem molt entre nosaltres."],
    },
    6: {
      negative: ["L'horari canvia massa sovint.", "Els equips són vells i s'espatllen.", "L'espai de treball no és adequat.", "Sovint ens saltem les pauses per la càrrega de feina."],
      neutral: ["Les condicions són acceptables, res d'especial.", "Algunes eines s'haurien de renovar.", "L'horari funciona la majoria de setmanes."],
      positive: ["Els equips nous són una gran millora.", "L'horari és estable i previsible.", "Bones condicions de treball en general."],
    },
  },
  THEME_COMMENTS: [
    {
      collectiuId: 1, domainId: 6, from: "2026-10-01",
      texts: [
        "Ens avisen massa tard dels canvis de torn.",
        "M'han canviat el torn amb un sol dia d'antelació.",
        "El nou quadre de torns no s'ha explicat a ningú.",
        "Ningú sap a qui preguntar pels canvis de torn.",
        "Els canvis de torn es pengen al tauler el dia abans.",
      ],
    },
    {
      collectiuId: 2, domainId: 6, from: "2026-08-15",
      texts: [
        "Al magatzem fa molta calor a la tarda.",
        "Els guants de seguretat es gasten massa de pressa.",
        "Cal una millor ventilació a la zona de càrrega.",
        "No hi ha prou aigua prop dels molls.",
        "Falten equips de seguretat al torn de nit.",
      ],
    },
    {
      collectiuId: 2, domainId: 2, from: "2026-10-08",
      texts: [
        "Des del canvi de supervisor ningú ens explica res.",
        "El supervisor va imposar la nova manera d'assignar rutes sense preguntar-nos.",
        "El cap va ignorar el problema que li vam plantejar.",
      ],
    },
  ],
};

export const ES_POOL: CommentPool = {
  COMMENTS: {
    1: {
      negative: ["Termino la mayoría de las semanas agotado.", "Hay demasiada presión para llegar a los objetivos, no hay tiempo para respirar.", "Me cuesta mucho desconectar después del trabajo.", "La carga de trabajo no deja de crecer y nadie dice nada."],
      neutral: ["Algunas semanas van bien y otras son muy pesadas.", "Depende mucho del período.", "Más pausas ayudarían."],
      positive: ["Me siento bien, el ritmo es razonable.", "Últimamente la carga de trabajo está más equilibrada.", "Puedo desconectar bien después del trabajo."],
    },
    2: {
      negative: ["Mi jefe no nos escucha cuando planteamos problemas.", "Las decisiones llegan desde arriba sin ninguna explicación.", "No hay feedback a no ser que algo vaya mal.", "No confío en cómo se toman las decisiones en mi área."],
      neutral: ["Depende de quién mande ese día.", "Solo hablamos cuando hay un problema.", "La comunicación con la dirección podría ser más clara."],
      positive: ["Mi jefe es cercano y justo.", "Recibimos feedback útil y de forma regular.", "Me siento apoyado por mi jefe."],
    },
    3: {
      negative: ["Aquí no hay ninguna oportunidad real de crecer.", "La formación es siempre la misma y no sirve.", "Los criterios de promoción no están nada claros.", "Hace años que hago las mismas tareas."],
      neutral: ["Algo de formación vendría bien.", "Las oportunidades existen pero hay que buscarlas.", "Me gustaría aprender más sobre otras áreas."],
      positive: ["El último curso fue muy útil.", "Este año he aprendido mucho.", "Veo cómo puedo ir ascendiendo aquí."],
    },
    4: {
      negative: ["El trabajo bien hecho no se reconoce.", "Las novedades de la empresa siempre nos llegan tarde.", "No siento que sea parte de la empresa.", "Parece que hay dos empresas: las oficinas centrales y el resto."],
      neutral: ["A veces me siento parte de la empresa y a veces no.", "La comunicación va mejorando poco a poco.", "Más encuentros con otros equipos ayudarían."],
      positive: ["Estoy orgulloso de trabajar aquí.", "Me siento parte del equipo y de la empresa.", "Los valores de la empresa me quedan claros."],
    },
    5: {
      negative: ["Hay tensión en el equipo que nadie aborda.", "Los conflictos no se gestionan con justicia.", "La coordinación con otros departamentos es mala.", "Algunas personas no son tratadas con respeto."],
      neutral: ["Bien con algunos compañeros, más difícil con otros.", "Trabajamos en silos.", "El ambiente cambia mucho de una semana a otra."],
      positive: ["Muy buen ambiente en mi equipo.", "Puedo ser yo mismo en el trabajo.", "Nos ayudamos mucho entre nosotros."],
    },
    6: {
      negative: ["El horario cambia demasiado a menudo.", "Los equipos son viejos y se estropean.", "El espacio de trabajo no es adecuado.", "A menudo nos saltamos las pausas por la carga de trabajo."],
      neutral: ["Las condiciones son aceptables, nada especial.", "Algunas herramientas habría que renovarlas.", "El horario funciona la mayoría de las semanas."],
      positive: ["Los equipos nuevos son una gran mejora.", "El horario es estable y previsible.", "Buenas condiciones de trabajo en general."],
    },
  },
  THEME_COMMENTS: [
    {
      collectiuId: 1, domainId: 6, from: "2026-10-01",
      texts: [
        "Nos avisan demasiado tarde de los cambios de turno.",
        "Me han cambiado el turno con un solo día de antelación.",
        "El nuevo cuadrante de turnos no se ha explicado a nadie.",
        "Nadie sabe a quién preguntar por los cambios de turno.",
        "Los cambios de turno se cuelgan en el tablón el día antes.",
      ],
    },
    {
      collectiuId: 2, domainId: 6, from: "2026-08-15",
      texts: [
        "En el almacén hace mucho calor por la tarde.",
        "Los guantes de seguridad se gastan demasiado rápido.",
        "Hace falta mejor ventilación en la zona de carga.",
        "No hay suficiente agua cerca de los muelles.",
        "Faltan equipos de seguridad en el turno de noche.",
      ],
    },
    {
      collectiuId: 2, domainId: 2, from: "2026-10-08",
      texts: [
        "Desde el cambio de supervisor nadie nos explica nada.",
        "El supervisor impuso la nueva forma de asignar rutas sin preguntarnos.",
        "El jefe ignoró el problema que le planteamos.",
      ],
    },
  ],
};

// ---- simple one-line fields (initiative, owner, timeframe, limits) ----------------------------------------------

export const REC_SIMPLE = {
  initiative: (ca: string, lang: Lang, m: Misses) => (lang === "ca" ? ca : trKey(INITIATIVE, ca, lang, m, "rec-iniciativa")),
  owner: (ca: string, lang: Lang, m: Misses) => (lang === "ca" ? ca : trKey(OWNER, ca, lang, m, "rec-responsable")),
  timeframe: (ca: string, lang: Lang, m: Misses) => (lang === "ca" ? ca : trKey(TIMEFRAME, ca, lang, m, "rec-termini")),
  limits: (ca: string, lang: Lang, m: Misses) => (lang === "ca" ? ca : trKey(LIMITS, ca, lang, m, "rec-limits")),
};
