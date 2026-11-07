import type { PreguntaTipus } from "@damm/shared";

export interface QItem {
  text: string;
  tipus: PreguntaTipus;
  key?: string; // marks the questions that carry the deliberate biases
}

// 7 closed items + 1 open item per domain. Each collective gets a rotated subset (see seed.ts).
export const BANK: Record<string, QItem[]> = {
  "Benestar": [
    { text: "Com valores el teu nivell d'energia aquesta setmana?", tipus: "scale5" },
    { text: "Tens una càrrega de feina assumible?", tipus: "scale5" },
    { text: "Del 0 al 10, quant cuida la teva salut el teu entorn de treball?", tipus: "scale10" },
    { text: "Has pogut desconnectar després de la jornada?", tipus: "yes_no" },
    { text: "Ordena què t'ajudaria més a estar millor: descans, horari, espais, suport.", tipus: "ranking" },
    { text: "Gestiones bé l'estrès del dia a dia?", tipus: "scale5" },
    { text: "Del 0 al 10, com és el teu benestar general?", tipus: "scale10" },
    { text: "Què t'ajudaria a sentir-te millor a la feina?", tipus: "open" },
  ],
  "Lideratge": [
    { text: "El teu responsable t'escolta quan tens un problema?", tipus: "scale5" },
    { text: "Reps feedback útil del teu responsable?", tipus: "scale5" },
    { text: "Confies en les decisions de la direcció?", tipus: "scale10" },
    { text: "Entens cap a on va l'empresa?", tipus: "yes_no" },
    { text: "Ordena què valores més en un responsable: escolta, claredat, justícia, suport.", tipus: "ranking" },
    { text: "Se't explica el perquè de les decisions que t'afecten?", tipus: "scale5" },
    { text: "Del 0 al 10, quant recomanaries el teu responsable?", tipus: "scale10" },
    { text: "Què faria millor el teu responsable?", tipus: "open" },
  ],
  "Desenvolupament": [
    { text: "Tens oportunitats d'aprendre coses noves?", tipus: "scale5" },
    { text: "La formació que reps és útil per a la teva feina?", tipus: "scale5" },
    { text: "Veus un camí de creixement a l'empresa?", tipus: "scale10" },
    { text: "Has après alguna cosa nova aquest mes?", tipus: "yes_no" },
    { text: "Ordena què t'interessa més: formació tècnica, idiomes, mobilitat, mentoria.", tipus: "ranking" },
    { text: "Els criteris de promoció són clars?", tipus: "scale5" },
    { text: "Del 0 al 10, quant et motiva el teu lloc de treball actual?", tipus: "scale10" },
    { text: "Quina formació t'agradaria rebre?", tipus: "open" },
  ],
  "Cultura i pertinença": [
    { text: "Et sents part de l'empresa?", tipus: "scale5" },
    { text: "Se't reconeix la feina ben feta?", tipus: "scale5" },
    { text: "Del 0 al 10, quant recomanaries l'empresa com a lloc de treball?", tipus: "scale10" },
    { text: "Treballar aquí et fa sentir orgull?", tipus: "yes_no" },
    { text: "Ordena què defineix millor la cultura: confiança, esforç, qualitat, proximitat.", tipus: "ranking" },
    { text: "La informació de l'empresa t'arriba a temps?", tipus: "scale5" },
    { text: "Del 0 al 10, quant coneixes els valors de l'empresa?", tipus: "scale10" },
    { text: "Què canviaries per sentir-te més part de l'empresa?", tipus: "open" },
  ],
  "Entorn i relacions": [
    { text: "Tens una bona relació amb els teus companys?", tipus: "scale5" },
    { text: "Pots ser com ets a l'equip?", tipus: "scale5" },
    { text: "Del 0 al 10, com valores l'ambient de l'equip?", tipus: "scale10" },
    { text: "Col·labores bé amb altres departaments?", tipus: "yes_no" },
    { text: "Ordena què fomentaria l'equip: trobades, reconeixement, comunicació, formació conjunta.", tipus: "ranking" },
    { text: "Els conflictes es resolen de manera justa?", tipus: "scale5" },
    { text: "Del 0 al 10, quant respecte sents a la feina?", tipus: "scale10" },
    { text: "Què milloraries de la relació entre equips?", tipus: "open" },
  ],
  "Condicions i organització": [
    { text: "Disposes de les eines necessàries per fer bé la teva feina?", tipus: "scale5" },
    { text: "L'organització del treball és clara?", tipus: "scale5" },
    { text: "Del 0 al 10, com valores la teva conciliació entre feina i vida personal?", tipus: "scale10" },
    { text: "Els espais de treball són adequats?", tipus: "yes_no" },
    { text: "Ordena què prioritzaries: horaris, eines, espais, planificació.", tipus: "ranking" },
    { text: "Els horaris i les planificacions són estables?", tipus: "scale5" },
    { text: "Del 0 al 10, com valores les condicions laborals en general?", tipus: "scale10" },
    { text: "Quina és la teva principal queixa organitzativa?", tipus: "open" },
  ],
};

// Extra collective-specific items (carry the deliberate biases).
export const EXTRA: Record<string, { domini: string; item: QItem }[]> = {
  "Fàbriques": [
    { domini: "Benestar", item: { text: "Les pauses durant el torn són suficients?", tipus: "scale5", key: "pauses" } },
    { domini: "Condicions i organització", item: { text: "El sistema de torns es comunica amb prou antelació?", tipus: "scale5", key: "torns" } },
    { domini: "Condicions i organització", item: { text: "Què canviaries del sistema de torns?", tipus: "open", key: "torns_obert" } },
  ],
  "Logística": [
    { domini: "Benestar", item: { text: "Les condicions de temperatura a la zona de treball són acceptables?", tipus: "scale5", key: "calor" } },
    { domini: "Condicions i organització", item: { text: "Disposes dels equips de protecció adequats per a la teva feina?", tipus: "scale5", key: "epi" } },
  ],
  "Comercial": [
    { domini: "Condicions i organització", item: { text: "Els desplaçaments i la planificació de rutes són raonables?", tipus: "scale5" } },
  ],
  "Oficines": [
    { domini: "Condicions i organització", item: { text: "El model híbrid de teletreball funciona per a tu?", tipus: "scale5" } },
  ],
};

/** Scale anchors (low, high). Stored in options_json as two scored labels so the UI can show them. */
export function anchorsOf(item: QItem): [string, string] | null {
  if (item.tipus === "scale5") {
    if (/^Com valores el teu nivell d'energia/.test(item.text)) return ["Molt baix", "Molt alt"];
    if (/^Gestiones bé/.test(item.text)) return ["Gens bé", "Molt bé"];
    if (/(t'escolta|feedback útil|Se't explica|Se't reconeix|informació de l'empresa)/.test(item.text)) return ["Mai", "Sempre"];
    return ["Gens d'acord", "Totalment d'acord"];
  }
  if (item.tipus === "scale10") {
    if (/recomanaries/.test(item.text)) return ["Gens probable", "Molt probable"];
    if (/(com és el teu benestar|com valores)/.test(item.text)) return ["Molt dolent", "Excel·lent"];
    return ["Gens", "Del tot"];
  }
  return null;
}
