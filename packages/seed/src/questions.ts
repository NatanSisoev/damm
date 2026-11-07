import type { PreguntaTipus } from "@damm/shared";

export interface QItem {
  text: string;
  tipus: PreguntaTipus;
  key?: string; // marks the questions that carry the deliberate biases
}

// 7 closed items + 1 open item per domain. Each collective gets a rotated subset (see seed.ts).
export const BANK: Record<string, QItem[]> = {
  "Benestar": [
    { text: "Com valores el teu nivell d'energia aquesta setmana?", tipus: "escala5" },
    { text: "Tens una càrrega de feina assumible?", tipus: "escala5" },
    { text: "Del 0 al 10, quant recomanaries el teu entorn de treball per a la salut?", tipus: "escala10" },
    { text: "Has pogut desconnectar després de la jornada?", tipus: "swipe" },
    { text: "Ordena què t'ajudaria més a estar millor: descans, horari, espais, suport.", tipus: "ranking" },
    { text: "Gestiones bé l'estrès del dia a dia?", tipus: "escala5" },
    { text: "Del 0 al 10, com és el teu benestar general?", tipus: "escala10" },
    { text: "Què t'ajudaria a sentir-te millor a la feina?", tipus: "obert" },
  ],
  "Lideratge": [
    { text: "El teu responsable t'escolta quan tens un problema?", tipus: "escala5" },
    { text: "Reps feedback útil del teu responsable?", tipus: "escala5" },
    { text: "Confies en les decisions de la direcció?", tipus: "escala10" },
    { text: "Entens cap a on va l'empresa?", tipus: "swipe" },
    { text: "Ordena què valores més en un responsable: escolta, claredat, justícia, suport.", tipus: "ranking" },
    { text: "Se't explica el perquè de les decisions que t'afecten?", tipus: "escala5" },
    { text: "Del 0 al 10, quant recomanaries el teu responsable?", tipus: "escala10" },
    { text: "Què faria millor el teu responsable?", tipus: "obert" },
  ],
  "Desenvolupament": [
    { text: "Tens oportunitats d'aprendre coses noves?", tipus: "escala5" },
    { text: "La formació que reps és útil per a la teva feina?", tipus: "escala5" },
    { text: "Veus un camí de creixement a l'empresa?", tipus: "escala10" },
    { text: "Has après alguna cosa nova aquest mes?", tipus: "swipe" },
    { text: "Ordena què t'interessa més: formació tècnica, idiomes, mobilitat, mentoria.", tipus: "ranking" },
    { text: "Els criteris de promoció són clars?", tipus: "escala5" },
    { text: "Del 0 al 10, quant et motiva el teu lloc de treball actual?", tipus: "escala10" },
    { text: "Quina formació t'agradaria rebre?", tipus: "obert" },
  ],
  "Cultura i pertinença": [
    { text: "Et sents part de l'empresa?", tipus: "escala5" },
    { text: "Se't reconeix la feina ben feta?", tipus: "escala5" },
    { text: "Del 0 al 10, quant recomanaries l'empresa com a lloc de treball?", tipus: "escala10" },
    { text: "Et sents orgullós de treballar aquí?", tipus: "swipe" },
    { text: "Ordena què defineix millor la cultura: confiança, esforç, qualitat, proximitat.", tipus: "ranking" },
    { text: "La informació de l'empresa t'arriba a temps?", tipus: "escala5" },
    { text: "Del 0 al 10, quant coneixes els valors de l'empresa?", tipus: "escala10" },
    { text: "Què canviaries per sentir-te més part de l'empresa?", tipus: "obert" },
  ],
  "Entorn i relacions": [
    { text: "Tens una bona relació amb els teus companys?", tipus: "escala5" },
    { text: "Pots ser tu mateix a l'equip?", tipus: "escala5" },
    { text: "Del 0 al 10, com valores l'ambient de l'equip?", tipus: "escala10" },
    { text: "Col·labores bé amb altres departaments?", tipus: "swipe" },
    { text: "Ordena què fomentaria l'equip: trobades, reconeixement, comunicació, formació conjunta.", tipus: "ranking" },
    { text: "Els conflictes es resolen de manera justa?", tipus: "escala5" },
    { text: "Del 0 al 10, quant et sents respectat a la feina?", tipus: "escala10" },
    { text: "Què milloraries de la relació entre equips?", tipus: "obert" },
  ],
  "Condicions i organització": [
    { text: "Disposes de les eines necessàries per fer bé la teva feina?", tipus: "escala5" },
    { text: "L'organització del treball és clara?", tipus: "escala5" },
    { text: "Del 0 al 10, com valores la teva conciliació entre feina i vida personal?", tipus: "escala10" },
    { text: "Els espais de treball són adequats?", tipus: "swipe" },
    { text: "Ordena què prioritzaries: horaris, eines, espais, planificació.", tipus: "ranking" },
    { text: "Els horaris i les planificacions són estables?", tipus: "escala5" },
    { text: "Del 0 al 10, com valores les condicions laborals en general?", tipus: "escala10" },
    { text: "Quina és la teva principal queixa organitzativa?", tipus: "obert" },
  ],
};

// Extra collective-specific items (carry the deliberate biases).
export const EXTRA: Record<string, { domini: string; item: QItem }[]> = {
  "Fàbriques": [
    { domini: "Benestar", item: { text: "Les pauses durant el torn són suficients?", tipus: "escala5", key: "pauses" } },
    { domini: "Condicions i organització", item: { text: "El sistema de torns es comunica amb prou antelació?", tipus: "escala5", key: "torns" } },
    { domini: "Condicions i organització", item: { text: "Què canviaries del sistema de torns?", tipus: "obert", key: "torns_obert" } },
  ],
  "Logística": [
    { domini: "Benestar", item: { text: "Les condicions de temperatura a la zona de treball són acceptables?", tipus: "escala5", key: "calor" } },
    { domini: "Condicions i organització", item: { text: "Disposes dels equips de protecció adequats per a la teva feina?", tipus: "escala5", key: "epi" } },
  ],
  "Comercial": [
    { domini: "Condicions i organització", item: { text: "Els desplaçaments i la planificació de rutes són raonables?", tipus: "escala5" } },
  ],
  "Oficines": [
    { domini: "Condicions i organització", item: { text: "El model híbrid de teletreball funciona per a tu?", tipus: "escala5" } },
  ],
};
