// TEMPORARY dashboard data until the analysis job writes tema/senyal/recomanacio from the seeded
// responses. `agregat` is no longer faked here: runEngineJob computes it after seeding.
import type Database from "better-sqlite3";

export function applyDashboardFixtures(db: Database.Database): void {
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
}
