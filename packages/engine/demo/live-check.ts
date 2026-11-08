// Rehearsal check for the live phone trigger: on a COPY of a demo DB, a fresh Comercial account answers the live need's
// question low / neutral / high, the job runs, and we report whether a sustained-decline alarm opens for the primed segment.
// The source DB is never modified. Run it on the exact DB you will demo, with the date you will demo on.
//
// Usage: node --experimental-strip-types --experimental-sqlite --no-warnings packages/engine/demo/live-check.ts \
//          [--db data/app.db] [--now 2026-11-08T10:00:00Z]
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createEngine } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { all } from "../src/db.ts";
import { LIVE_TRIGGER } from "./build-demo.ts";

const { values } = parseArgs({ options: { db: { type: "string" }, now: { type: "string" } } });
const src = resolve(values.db ?? "data/app.db");
const now = values.now ? Date.parse(values.now) : Date.now();
const dir = mkdtempSync(join(tmpdir(), "live-check-"));
const key = (r: { collectiu_id: number | null; domini_id: number | null }) => r.collectiu_id === LIVE_TRIGGER.collectiuId && r.domini_id === LIVE_TRIGGER.domainId;

let failed = false;
for (const [label, valorNum, shouldTrip] of [["low (1/5)", 1, true], ["neutral (3/5)", 3, false], ["high (5/5)", 5, false]] as const) {
  const copy = join(dir, "c.db");
  copyFileSync(src, copy);
  const db = new DatabaseSync(copy);
  db.exec("PRAGMA journal_mode = WAL");
  const before = all<{ id: number }>(db, "SELECT id FROM senyal").map((r) => r.id);
  const model = db.prepare("SELECT centre_tipus_id, torn_id FROM compte WHERE collectiu_id = ? LIMIT 1").get(LIVE_TRIGGER.collectiuId) as { centre_tipus_id: number; torn_id: number | null };
  db.prepare("INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, es_manager, username, password_hash, salt, creat) VALUES ('live-check', ?, ?, ?, 0, 'live-check', 'x', 'x', datetime('now'))")
    .run(LIVE_TRIGGER.collectiuId, model.centre_tipus_id, model.torn_id);
  const engine = createEngine({ db: db as never, redact: (s) => s, now: () => now });
  const batch = engine.getDailyBatch("live-check");
  const q = db.prepare("SELECT p.id FROM pregunta p JOIN necessitat n ON n.id = p.necessitat_id WHERE p.facet = 'growth_room' AND n.collectiu_id = ? ORDER BY p.id DESC LIMIT 1").get(LIVE_TRIGGER.collectiuId) as { id: number } | undefined;
  if (!q) throw new Error("live need question not found: build the DB with the current build-demo.ts");
  const served = batch.items.findIndex((it) => it.questionId === q.id);
  engine.submitAnswers("live-check", [{ preguntaId: q.id, valorNum, answerMs: 2500 }]);
  const t0 = Date.now();
  runEngineJob(db as never, { now });
  const ms = Date.now() - t0;
  const opened = all<{ id: number; tipus: string; severity: string; collectiu_id: number | null; domini_id: number | null }>(
    db as never,
    "SELECT id, tipus, severity, collectiu_id, domini_id FROM senyal WHERE suprimit = 0",
  ).filter((r) => !before.includes(r.id));
  const live = opened.filter((r) => key(r));
  const scores = all<{ periode: string; n: number; score: number }>(
    db as never,
    "SELECT periode, n, score FROM agregat WHERE collectiu_id = ? AND torn_id IS NULL AND domini_id = ? ORDER BY periode DESC LIMIT 3",
    LIVE_TRIGGER.collectiuId,
    LIVE_TRIGGER.domainId,
  ).reverse();
  const ok = served === 0 && (live.length > 0) === shouldTrip;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${label.padEnd(14)} served at position ${served}; new alarms in primed segment: ${live.map((r) => `${r.tipus}/${r.severity}`).join(",") || "none"}` +
      `; other new alarms: ${opened.length - live.length}; job ${ms} ms; ${scores.map((s) => `${s.periode.slice(5)}=${s.score}(n${s.n})`).join(" ")}`,
  );
  db.close();
}
rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
