// Creates data/app.db from schema.sql plus minimal reference data and a few demo rows.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { COLLECTIUS, DOMINIS, TORNS } from "@damm/shared";

const root = path.resolve(__dirname, "../../..");
const out = process.env.DB_PATH ?? path.join(root, "data/app.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });

const db = new Database(out);
db.exec(fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8"));

const ins = (t: string, names: readonly string[]) => {
  const s = db.prepare(`INSERT INTO ${t} (nom) VALUES (?)`);
  names.forEach((n) => s.run(n));
};
ins("collectiu", COLLECTIUS);
ins("domini", DOMINIS);
ins("torn", TORNS);
ins("centre_tipus", ["fabrica", "magatzem", "oficina", "comercial"]);

// Demo rows so the HR screens have something to show. Replaced by the real seed later.
db.prepare("INSERT INTO necessitat (text_nl, collectiu_id, durada_max_s) VALUES (?,?,?)")
  .run("Volem saber com viuen els equips de planta el nou sistema de torns.", 1, 120);
const q = db.prepare(
  "INSERT INTO pregunta (domini_id, collectiu_id, text, tipus, necessitat_id, generada_per_ia) VALUES (?,?,?,?,1,1)",
);
q.run(6, 1, "El sistema de torns es comunica amb prou antelació?", "scale5");
q.run(1, 1, "Les pauses durant el torn són suficients?", "scale5");
q.run(4, 1, "Què canviaries del sistema de torns?", "open");

// Synthetic population (denominator for representativeness): 1,200 employees.
const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (?,?,?)");
const pop: [number, number, number | null, number][] = [
  [1, 1, 1, 180], [1, 1, 2, 140], [1, 1, 3, 100], // Fàbriques by shift
  [2, 2, 1, 120], [2, 2, 2, 100], [2, 2, 3, 80], // Logística by shift
  [3, 4, null, 250], [4, 3, null, 230],
];
for (const [c, ct, t, n] of pop) for (let i = 0; i < n; i++) emp.run(c, ct, t);

// agregat is written by the engine job (runEngineJob) after seeding.

// tema, comentari_tema and emergent senyal rows come from the comment analysis (runCommentAnalysisSync), not from here.
db.close();
console.log("DB created at", out);
