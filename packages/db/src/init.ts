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
q.run(6, 1, "El sistema de torns es comunica amb prou antelació?", "escala5");
q.run(1, 1, "Les pauses durant el torn són suficients?", "escala5");
q.run(4, 1, "Què canviaries del sistema de torns?", "obert");

const ag = db.prepare("INSERT INTO agregat (periode, collectiu_id, torn_id, domini_id, n, mitjana, suprimit) VALUES (?,?,?,?,?,?,?)");
ag.run("2026-10", 1, 1, 6, 64, 3.6, 0);
ag.run("2026-10", 1, 3, 6, 12, 2.9, 0);
ag.run("2026-10", 2, 3, 6, 6, 3.1, 0); // below 10: hidden on read
// Synthetic population (denominator for representativeness): 1,200 employees.
const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id) VALUES (?,?,?)");
const pop: [number, number, number | null, number][] = [
  [1, 1, 1, 180], [1, 1, 2, 140], [1, 1, 3, 100], // Fàbriques by shift
  [2, 2, 1, 120], [2, 2, 2, 100], [2, 2, 3, 80], // Logística by shift
  [3, 4, null, 250], [4, 3, null, 230],
];
for (const [c, ct, t, n] of pop) for (let i = 0; i < n; i++) emp.run(c, ct, t);

// Respondents (domini NULL) for the latest period; Logística night shift is below the minimum.
const resp: [number, number | null, number][] = [
  [1, null, 150], [1, 1, 70], [1, 2, 55], [1, 3, 25],
  [2, null, 100], [2, 1, 50], [2, 2, 44], [2, 3, 6],
  [3, null, 90], [4, null, 160],
];
for (const [c, t, n] of resp) ag.run("2026-10", c, t, null, n, null, n < 10 ? 1 : 0);

// Mean score per domain and period, overall (collectiu NULL) and per collective. A few cells are small.
const periods = ["2026-08", "2026-09", "2026-10"];
const base = [3.8, 3.6, 3.4, 3.7, 3.9, 3.3];
for (const c of [null, 1, 2, 3, 4]) {
  for (let d = 1; d <= 6; d++) {
    periods.forEach((per, pi) => {
      const drift = d === 6 ? -0.25 * pi : d === 1 && c === 2 ? -0.1 * pi : 0.05 * pi;
      const n = c === null ? 480 + pi * 20 : c === 2 && pi === 0 && d === 3 ? 7 : 40 + pi * 5 + c;
      const small = n < 10;
      const mean = Math.round((base[d - 1] + drift + (c ?? 0) * 0.04) * 10) / 10;
      ag.run(per, c, null, d, n, small ? null : mean, small ? 1 : 0);
    });
  }
}

// Themes from comment clustering. October has an emergent theme; one theme is below the minimum.
const tm = db.prepare("INSERT INTO tema (etiqueta, resum, periode, n, emergent, suprimit) VALUES (?,?,?,?,?,?)");
tm.run("Comunicació del sistema de torns i pauses", "Els canvis de torn arriben tard i les pauses no es respecten.", "2026-10", 62, 1, 0);
tm.run("Càrrega de feina a final de mes", "Pics de feina sense reforç d'equip.", "2026-10", 28, 0, 0);
tm.run("Equips de seguretat i calor", "Poques dades en aquest segment.", "2026-10", 8, 0, 1);
tm.run("Reconeixement de l'equip", "Valoració positiva del suport dels companys.", "2026-09", 41, 0, 0);
tm.run("Formació i desenvolupament", "Demanda de més plans de formació.", "2026-08", 35, 0, 0);

db.prepare("INSERT INTO senyal (tipus, descripcio, collectiu_id, periode, n, confianca) VALUES (?,?,?,?,?,?)")
  .run("emergent", "Comunicació del sistema de torns i pauses", 1, "2026-10", 31, 0.8);
db.prepare("INSERT INTO recomanacio (senyal_id, text) VALUES (1, ?)")
  .run("Publicar els torns amb 15 dies d'antelació i fer una enquesta de seguiment.");
db.close();
console.log("DB created at", out);
