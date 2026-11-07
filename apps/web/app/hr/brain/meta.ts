// What each engine parameter means, in Catalan, with the range the sliders allow.
// Keys are the engine_config keys (snake_case). Ranges are guard rails for the UI; the engine validates again.
import type { QuestionType } from "@damm/shared";

export interface ParamMeta {
  key: string;
  label: string;
  hint: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  /** Shown as a percentage (value 0..1). */
  percent?: boolean;
}

export interface ParamGroup {
  id: string;
  title: string;
  intro: string;
  params: ParamMeta[];
}

export const PARAM_GROUPS: ParamGroup[] = [
  {
    id: "batch",
    title: "Quantes preguntes i quines",
    intro: "El ritme diari i com es reparteix entre àmbits.",
    params: [
      { key: "questions_per_day", label: "Preguntes per dia", hint: "Mida del lot diari de cada persona. Les necessitats publicades s'hi afegeixen per sobre.", min: 1, max: 8, step: 1 },
      { key: "max_needs_per_day", label: "Necessitats dins del lot", hint: "Quantes preguntes de necessitats ocupen lloc del lot cada dia. La resta s'afegeixen després.", min: 0, max: 4, step: 1 },
      { key: "item_cooldown_days", label: "Dies abans de repetir una pregunta", hint: "Una pregunta que una persona ha vist fa menys dies d'aquests es deixa reposar, si hi ha alternativa.", unit: "dies", min: 0, max: 90, step: 1 },
      { key: "domain_floor", label: "Interès mínim per àmbit", hint: "Evita que un àmbit ben mesurat desaparegi del tot. Més alt, repartiment més uniforme.", min: 0, max: 1, step: 0.01 },
      { key: "outlier_boost", label: "Força de l'impuls per canvis bruscos", hint: "Quant més es pregunta en un àmbit on moltes persones s'han desviat de la seva línia habitual.", min: 0, max: 3, step: 0.05 },
      { key: "outlier_z", label: "Llindar de desviació (σ)", hint: "A partir de quantes desviacions una resposta compta com a canvi brusc.", min: 1, max: 4, step: 0.1 },
      { key: "outlier_window_days", label: "Finestra de canvis recents", hint: "Només es miren respostes d'aquests últims dies per detectar canvis bruscos.", unit: "dies", min: 3, max: 60, step: 1 },
    ],
  },
  {
    id: "confidence",
    title: "Confiança i memòria",
    intro: "Com es converteix cada resposta en una puntuació i quanta confiança dona.",
    params: [
      { key: "half_life_days", label: "Vida mitjana d'una resposta", hint: "Cada tants dies una resposta pesa la meitat. Més curt, el motor oblida abans i reacciona més ràpid.", unit: "dies", min: 3, max: 120, step: 1 },
      { key: "se_tolerance", label: "Error acceptable", hint: "Error estàndard al qual la confiança arriba al 0 %. Més estret, es demana més dades per fiar-se.", min: 0.01, max: 0.2, step: 0.005 },
      { key: "small_sample_variance", label: "Cautela amb poques dades", hint: "Variància afegida perquè pocs resultats no semblin més segurs del que són.", min: 0, max: 0.1, step: 0.001 },
      { key: "process_noise_per_day", label: "Canvi natural per dia", hint: "Quant s'espera que una persona canviï d'opinió per si sola cada dia. Fa créixer la incertesa amb el temps.", min: 0, max: 0.01, step: 0.0001 },
      { key: "item_bias_shrinkage", label: "Prudència amb el biaix d'una pregunta", hint: "Quantes respostes calen abans de fiar-se que una pregunta puntua sistemàticament més alt o més baix.", unit: "respostes", min: 1, max: 200, step: 1 },
      { key: "min_answer_ms", label: "Temps mínim per considerar una resposta atenta", hint: "Les respostes més ràpides no compten com a formats que funcionen.", unit: "ms", min: 0, max: 10000, step: 100 },
    ],
  },
  {
    id: "followup",
    title: "Seguiment de canvis",
    intro: "Quan una resposta sorprèn, el motor torna a preguntar al cap d'uns dies per confirmar-ho.",
    params: [
      { key: "followup_z", label: "Sorpresa que dispara el seguiment (σ)", hint: "Una resposta que s'allunya tantes desviacions de la persona obre un seguiment.", min: 1, max: 5, step: 0.1 },
      { key: "followup_min_days", label: "Espera mínima", hint: "Dies mínims abans de repetir la pregunta.", unit: "dies", min: 1, max: 30, step: 1 },
      { key: "followup_max_days", label: "Espera màxima", hint: "Dies màxims abans de repetir la pregunta.", unit: "dies", min: 1, max: 60, step: 1 },
      { key: "followup_inflation", label: "Incertesa afegida mentre s'espera", hint: "Variància extra de la persona fins que es confirma el canvi.", min: 0, max: 0.2, step: 0.005 },
      { key: "confirm_sigmas", label: "Sigmes per confirmar un canvi", hint: "Quan la resposta del seguiment s'allunya tant de l'anterior, el canvi es dona per confirmat.", min: 0.5, max: 5, step: 0.1 },
    ],
  },
];

export const FORMAT_LABELS: Record<QuestionType, string> = {
  scale10: "Escala 0-10",
  scale5: "Escala 1-5",
  yes_no: "Sí o no",
  pair: "Una o l'altra",
  choice: "Tria una frase",
  ranking: "Ordena",
  open: "Resposta oberta",
};

export const CLOSED_TYPES = ["scale10", "scale5", "yes_no", "pair", "choice"] as const;

export const REASON_LABELS: Record<string, string> = {
  monitor: "Seguiment continu",
  need: "Necessitat",
  followup: "Confirmació de canvi",
};

export const WEIGHT_SOURCE_LABELS: Record<string, string> = {
  collective: "propi del col·lectiu",
  default: "valor general",
  none: "per defecte",
};
