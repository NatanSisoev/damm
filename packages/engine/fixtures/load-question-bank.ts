// Loads the sample question bank (question-bank.json) into `pregunta`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTIUS } from "@damm/shared";
import { all, one, run, transaction, type SqlDatabase } from "../src/db.ts";

export interface BankQuestion {
  domainId: number;
  facet: string;
  type: string;
  text: string;
  polarity: number;
  /** pair/choice: [{label, score}]; ranking: [{label, domain_id}] */
  options?: Array<{ label: string; score?: number; domain_id?: number }>;
  /** 1..4 in COLLECTIUS order (Fàbriques, Logística, Comercial, Oficines); absent = everyone */
  collectiuId?: number;
  isFollowup?: boolean;
}

export function readQuestionBank(): BankQuestion[] {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "question-bank.json"), "utf8")) as BankQuestion[];
}

/**
 * Inserts the bank into `pregunta` (default estat 'aprovada'). Returns the number of rows inserted.
 * Collective ids in the bank follow COLLECTIUS order; they are mapped to the ids the DB uses by name,
 * so the DB must already contain the collectives the bank refers to.
 */
export function loadQuestionBank(db: SqlDatabase, opts: { estat?: string } = {}): number {
  const estat = opts.estat ?? "aprovada";
  const bank = readQuestionBank();
  const dbIds = new Map(all<{ id: number; nom: string }>(db, "SELECT id, nom FROM collectiu").map((c) => [c.nom, c.id]));
  const collectiu = (bankId: number | undefined): number | null => {
    if (bankId === undefined) return null;
    const name = COLLECTIUS[bankId - 1];
    const id = name === undefined ? undefined : dbIds.get(name);
    if (id === undefined) throw new Error(`question bank refers to collective ${bankId} (${name}) which is not in the database`);
    return id;
  };
  return transaction(db, () => {
    for (const q of bank) {
      run(
        db,
        `INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, estat)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        q.domainId,
        collectiu(q.collectiuId),
        q.text,
        q.type,
        q.facet,
        q.polarity,
        q.options ? JSON.stringify(q.options) : null,
        q.isFollowup ? 1 : 0,
        estat,
      );
    }
    return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM pregunta WHERE estat = ?", estat)?.n ?? 0;
  });
}

/** Bank scale / yes-no questions that carry a linked open follow-up ("What would make it better?"), keyed by parent text. */
const FOLLOWUPS: { parent: string; when: "low" | "no"; text: { ca: string; es: string; en: string } }[] = [
  { parent: "My workload is manageable.", when: "low", text: { ca: "Què faria més assumible la teva càrrega de feina?", es: "¿Qué haría más asumible tu carga de trabajo?", en: "What would make your workload more manageable?" } },
  { parent: "My manager takes into account what I tell them.", when: "low", text: { ca: "Què hauria de fer diferent el teu responsable perquè se't escolti millor?", es: "¿Qué debería hacer diferente tu responsable para escucharte mejor?", en: "What could your manager do differently to listen better?" } },
  { parent: "I know my schedule far enough in advance to plan my life.", when: "low", text: { ca: "Què milloraria la manera com et comuniquen l'horari?", es: "¿Qué mejoraría la forma en que te comunican el horario?", en: "What would improve how your schedule is communicated?" } },
  { parent: "When you raised a problem, did your manager act on it?", when: "no", text: { ca: "Què hauria canviat perquè es tingués en compte el teu avís?", es: "¿Qué habría cambiado para que se tuviera en cuenta tu aviso?", en: "What would have made your concern get acted on?" } },
  { parent: "Were you told in good time about your schedule for next week?", when: "no", text: { ca: "Com t'hauria d'arribar l'horari perquè t'hi puguis organitzar?", es: "¿Cómo debería llegarte el horario para que puedas organizarte?", en: "How should the schedule reach you so you can plan?" } },
];

/**
 * Adds the conditional open follow-ups to the bank questions listed above (R-FLOW-2e). Needs the bank loaded and
 * the `followup_of`/`followup_when` columns. Idempotent per parent. Returns the number inserted.
 */
export function loadBankFollowups(db: SqlDatabase): number {
  let n = 0;
  transaction(db, () => {
    for (const f of FOLLOWUPS) {
      const p = one<{ id: number; domini_id: number; facet: string | null }>(db, "SELECT id, domini_id, facet FROM pregunta WHERE text = ? AND followup_of IS NULL", f.parent);
      if (!p || one(db, "SELECT 1 AS x FROM pregunta WHERE followup_of = ?", p.id)) continue;
      run(
        db,
        `INSERT INTO pregunta (domini_id, collectiu_id, text, text_i18n, tipus, facet, polarity, is_followup, followup_of, followup_when, estat, ordre)
         VALUES (?, NULL, ?, ?, 'open', ?, 1, 0, ?, ?, 'aprovada', 0)`,
        p.domini_id,
        f.text.en,
        JSON.stringify(f.text),
        `${p.facet ?? `q${p.id}`}_why`,
        p.id,
        f.when,
      );
      n++;
    }
  });
  return n;
}
