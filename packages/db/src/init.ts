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
db.prepare("INSERT INTO senyal (tipus, descripcio, collectiu_id, periode, n, confianca) VALUES (?,?,?,?,?,?)")
  .run("emergent", "Comunicació del sistema de torns i pauses", 1, "2026-10", 31, 0.8);
db.prepare("INSERT INTO recomanacio (senyal_id, text) VALUES (1, ?)")
  .run("Publicar els torns amb 15 dies d'antelació i fer una enquesta de seguiment.");
db.close();
console.log("DB created at", out);
