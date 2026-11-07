// Theme taxonomy and lexicon for the deterministic comment classifier (docs/engine.md section 12).
// Text is normalised first (lowercase, no accents, no punctuation), so entries are written without accents.
// Entry syntax:
//   "stem"     a token that starts with the stem (typos of one letter tolerated when the stem has 6+ letters)
//   "word="    a token equal to the word
//   "two words" the phrase, starting at a word boundary
//   "+entry"   strong evidence: counts double
// Catalan, Spanish and English are covered (the demo data is English, the seed data Catalan).

export interface ThemeDef {
  key: string;
  label: string;
  /** Domain name (domini.nom) the theme belongs to, used for the alarm's domain. */
  domain: string | null;
  /** Safety and harassment content: counted in aggregate only, never an alarm, no comment links, no LLM summary. */
  sensitive?: boolean;
  lexicon: string[];
}

export const THEMES: ThemeDef[] = [
  {
    key: "carrega_treball", label: "Càrrega de treball", domain: "Benestar",
    lexicon: ["+pics de produccio", "+falta gent", "+ens falta gent", "+falten persones", "+fer una tasca", "+mes feina de la que", "+carrega de", "+carga de", "+workload", "+sobrecarg", "+overload", "pressio", "presion", "pressure", "+feina a casa", "+porto feina", "+volum de feina", "+massa feina", "+mucho trabajo", "+too much work",
      "anem tots justos", "anem justos", "baixes", "bajas", "falta de personal", "falten mans", "faltan manos", "understaffed", "ritme", "ritmo", "pace", "repartid", "reparteix", "tasques", "tareas", "tasks", "objectius", "pics de feina", "reforc", "refuerzo", "temps per respirar", "time to breathe", "numbers"],
  },
  {
    key: "cansament_descans", label: "Cansament i descans", domain: "Benestar",
    lexicon: ["+dormo", "+recuperar", "+recuperarse", "+estres", "+cansa", "+cansad", "+cansancio", "+exhaust", "+esgot", "+agotad", "+tired", "+fatig", "estres", "stress", "descans", "descanso", "+desconnect", "+desconect", "+switch off", "energi", "energy", "dormir", "dormo", "son=", "insomni", "sleep", "sueno", "burnout", "ganes", "esgotament"],
  },
  {
    key: "relacio_cap", label: "Relació amb el cap directe", domain: "Lideratge",
    lexicon: ["+se ns explica", "+explica per que", "+el cap", "+confianca", "+per part del responsable", "+cap directe", "+el meu cap", "+meu cap", "+mi jefe", "+mi responsable", "+cap d equip", "+cap de torn", "+cap de seccio", "+jefe", "+supervisor", "+my manager", "+my boss", "+boss", "+encarregat", "+responsable directe", "+responsable de",
      "feedback", "retroalimentaci", "reunions d equip", "reuniones de equipo", "team meetings", "culpables", "culpa", "blame", "escolta", "escucha", "listen", "tracte", "trato", "approachable", "accessible", "accesible", "constancia", "fair=", "just="],
  },
  {
    key: "direccio_visio", label: "Direcció i visió de futur", domain: "Lideratge",
    lexicon: ["+full de ruta", "+coherencia", "+cap on va", "+propers anys", "+oficines centrals", "+visitessin", "+es parla de canvis", "+no se sap", "+direccio", "+direccion", "+alta direccio", "+senior management", "+management", "+head office", "+seu central", "+from above", "+des de dalt", "+desde arriba", "+rumb", "+rumbo", "+estrateg", "+strateg", "+visio", "+vision de futur", "+future",
      "empresa ha pres", "decisions", "decisiones", "decisions are made", "transparencia", "transparency", "objectius de l empresa", "resultats", "resultados", "company goals", "ceo", "directius", "directivos"],
  },
  {
    key: "formacio", label: "Formació", domain: "Desenvolupament",
    lexicon: ["+formaci", "+formacion", "+training", "+curs=", "+cursos", "+curso", "+course", "+capacitaci", "+taller", "+workshop", "aprendre", "aprender", "+learn", "+ensenya", "sessions internes", "idiomes", "idiomas", "languages", "certificaci"],
  },
  {
    key: "carrera_promocio", label: "Carrera i promoció", domain: "Desenvolupament",
    lexicon: ["+vacants", "+mobilitat interna", "+oportunitats", "+canviar de tasques", "+carrera", "+career", "+promoci", "+promotion", "+ascens", "+ascend", "+ascenso", "+promocion", "perspectives", "perspectivas", "creixement", "crecimiento", "+grow", "+growth", "antiguitat", "antiguedad", "seniority", "criteris", "criterios", "criteria", "talent", "+mateix i no hi ha", "+same tasks", "+mateixes tasques", "+moving up", "move up", "rotaci", "salari", "salario", "salary", "sou="],
  },
  {
    key: "reconeixement", label: "Reconeixement", domain: "Cultura i pertinença",
    lexicon: ["+desapercebut", "+destaquessin", "+exits", "+simple gracies", "+esforc", "+reconeix", "+reconoc", "+reconeg", "+reconeixement", "+recognis", "+recogniz", "+recognit", "+valoro", "+valoran", "+valorad", "+valorat", "+valued", "+appreciat", "+felicit", "+congratul", "+bones idees", "+buenas ideas", "+good ideas", "+feina ben feta", "+trabajo bien hecho", "+good work", "+well done", "+detall que", "premi", "reward", "incentiu", "incentivo", "agraiment", "agradecimiento", "thanks=", "orgull", "proud", "orgullos"],
  },
  {
    key: "comunicacio_interna", label: "Comunicació interna", domain: "Cultura i pertinença",
    lexicon: ["+novetats", "+passadissos", "+canals oficials", "+resum mensual", "+reunions curtes", "+al dia", "+instruccions", "+se sap tard", "+tauler d anuncis", "+anuncis", "+assabent", "+enterem", "+comunicaci", "+comunicac", "+communication", "+correus", "+correu=", "+correos", "+emails", "+email=", "+intranet", "+circular", "+newsletter", "+noticies", "+noticias", "+news=", "+comunicats", "+comunicado", "+missatges", "+mensajes", "+messages", "+informaci", "+informacion", "+information",
      "arriba la mateixa", "ens assabentem", "ens enterem", "nos enteramos", "find out", "arriba tard", "reaches us", "tablon", "tauler", "board"],
  },
  {
    key: "ambient_equip", label: "Ambient d'equip", domain: "Entorn i relacions",
    lexicon: ["+fora de lloc", "+comentaris fora", "+crear equip", "+ambient", "+ambiente", "+atmosfera", "+atmosphere", "+rotllo", "+companys", "+companyer", "+companeros", "+compañeros", "+colleagues", "+teammates", "+tensio", "+tension", "+conflict", "+respecte", "+respeto", "+respect", "+treated with", "+tracte entre", "+cohesi", "+help each other", "+ens ajudem", "+nos ayudamos", "+be myself", "+ser jo", "relacio amb els", "equip de treball", "bon equip", "teamwork", "treball en equip", "trabajo en equipo", "units=", "unidos"],
  },
  {
    key: "col_laboracio", label: "Col·laboració entre departaments", domain: "Entorn i relacions",
    lexicon: ["+duplicitat", "+entre equips", "+collaborac", "+colaborac", "+collaborat", "+cooperaci", "+cooperation", "+departament", "+departamento", "+department", "+altres arees", "+otras areas", "+other areas", "+entre arees", "+entre areas", "+between areas", "+altres equips", "+other teams", "+otros equipos", "+coordinaci", "+coordination", "+silos", "+silo=", "+transversal", "adrecar", "dirigirse", "who to ask", "a qui", "trobades entre", "reunions entre", "altres seccions", "interdepart"],
  },
  {
    key: "eines_sistemes", label: "Eines i sistemes", domain: "Condicions i organització",
    lexicon: ["+neteja", "+espais de treball", "+ordre i", "+eines", "+herramientas", "+tools", "+sistemes", "+sistemas", "+systems", "+informatic", "+informatica", "+aplicaci", "+app=", "+apps=", "+software", "+programa=", "+programes", "+ordinador", "+ordenador", "+computer", "+portatil", "+laptop", "+mobil", "+movil", "+mobile", "+wifi", "+erp", "+intranet", "+equipament", "+equipamiento", "+equipment is old", "+maquin", "+machine", "+tecnolog", "+technolog", "+digital", "avaria", "averi", "breaks down", "dades de feina"],
  },
  {
    key: "conciliacio_horaris", label: "Conciliació i horaris", domain: "Condicions i organització",
    lexicon: ["+festes", "+franja", "+agafar festes", "+concilia", "+horari", "+horario", "+teletreball", "+teletrabajo", "+remote work", "+work from home", "+vida personal", "+personal life", "+work life", "+vida familiar", "+familia", "+family", "+hores extra", "+horas extra", "+overtime", "+vacances", "+vacaciones", "+holidays", "+permisos", "+permiso", "+flexib", "+planificaci", "+planificacion", "+planning", "+sortida", "+cap de setmana", "+caps de setmana", "+fin de semana", "+weekend", "+jornada", "+schedule", "+reorganitzar", "+canvis d ultima hora", "+ultima hora", "+last minute", "+last-minute"],
  },
  {
    key: "torns_comunicacio_pauses", label: "Comunicació del sistema de torns i pauses", domain: "Condicions i organització",
    lexicon: ["+torn=", "+torns=", "+turno=", "+turnos=", "+shift=", "+shifts=", "+quadre de torns", "+calendari de torns", "+cambio de turno", "+canvi de torn", "+rotacio de torns", "+rota=", "+rotas=", "+swaps=", "+swap=", "++pausa=", "++pauses=", "++pausas=", "+pausa", "+pauses", "+break=", "+breaks=", "+descansos=", "+relleu", "+relevo", "+quadrant", "+cuadrante", "+nit=", "+night="],
  },
  {
    key: "seguretat_calor_epi", label: "Calor i equips de protecció (EPI)", domain: "Benestar",
    lexicon: ["+ventilador", "+marejats", "+moll de carrega", "+epi=", "+epis=", "+seguretat", "+seguridad", "+safety", "+calor", "+heat", "+hot=", "+temperatur", "+ventilaci", "+ventilation", "+aire condicionat", "+aire acondicionado", "+air conditioning", "+botes", "+botas", "+boots", "+guants", "+guantes", "+gloves", "+casc=", "+casco", "+helmet", "+proteccio", "+proteccion", "+protection", "+protective", "+aigua", "+agua", "+water", "+hidrata", "+refrigera", "+sufocant", "+suffocating", "+muntacarreg", "+forklift"],
  },
  {
    key: "sensible", label: "Temes sensibles (assetjament, seguretat personal)", domain: null, sensitive: true,
    lexicon: ["+assetj", "+acoso", "+harass", "+agress", "+amenaç", "+amenac", "+amenaz", "+threat", "+discrimin", "+abus", "+bullying", "+mobbing", "+violenc", "+violence", "+insult", "+accident", "+lesio", "+lesion", "+injur", "+maltract", "+intimid", "+racis", "+sexis", "+masclis", "+denuncia"],
  },
];

export const THEME_KEYS = new Set(THEMES.map((t) => t.key));
export const THEME_BY_KEY = new Map(THEMES.map((t) => [t.key, t]));
