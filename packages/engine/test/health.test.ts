import { test } from "node:test";
import assert from "node:assert/strict";
import { runEngineJob } from "../src/job.ts";
import { all, run } from "../src/db.ts";
import { runHealth } from "../scripts/health-checks.ts";
import { cloneDb } from "./db-util.ts";
import { generateWorld } from "./world-gen.ts";

const failures = (db: Parameters<typeof runHealth>[0], now: number) => runHealth(db, { now }).filter((c) => c.status === "fail").map((c) => c.name);

test("health check passes on a healthy database and flags each kind of corruption", () => {
  const w = generateWorld("health", { accountsPerCollective: 16, days: 30, participation: 0.8 });
  // The last simulated answer, so "live" (answers within a day of the wall clock) can be exercised.
  const at = Date.parse(`${(all<{ d: string }>(w.db, "SELECT MAX(data) AS d FROM resposta")[0]!.d).replace(" ", "T")}Z`) + 60_000;
  assert.deepEqual(failures(w.db, at), ["data present", "engine_version present", "last job time recent"], "before the first job run");
  runEngineJob(w.db, { now: at });
  assert.deepEqual(failures(w.db, at + 60_000), []);
  // Live system, job went quiet for 2 hours.
  assert.deepEqual(failures(w.db, at + 2 * 3_600_000), ["last job time recent"]);
  // Historic dataset: wall clock a week later is fine.
  assert.deepEqual(failures(w.db, at + 7 * 86_400_000), [], "historic dataset");

  const cases: [string, string, string][] = [
    ["answer scores in [0,1]", "UPDATE resposta SET score = 1.5 WHERE id = (SELECT MIN(id) FROM resposta WHERE score IS NOT NULL)", ""],
    ["aggregates in range", "UPDATE agregat SET score = 11 WHERE suprimit = 0 AND id = (SELECT MIN(id) FROM agregat WHERE suprimit = 0)", ""],
    ["suppression: agregat", "UPDATE agregat SET n = 4 WHERE suprimit = 0 AND id = (SELECT MIN(id) FROM agregat WHERE suprimit = 0)", ""],
    ["suppression: insight", "UPDATE insight SET n = 2 WHERE suprimit = 0 AND id = (SELECT MIN(id) FROM insight WHERE suprimit = 0)", ""],
    ["no NaN or infinity", "UPDATE person_domain_state SET variance = 1e999 WHERE rowid = (SELECT MIN(rowid) FROM person_domain_state)", "personal state in range"],
    ["engine_version present", "DELETE FROM engine_config WHERE key = 'engine_version'", ""],
    ["alarms deduplicated", "INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, severity, audience) VALUES ('sharp_drop','a',1,1,'2026-09',20,'warning','hr'), ('sharp_drop','b',1,1,'2026-09',20,'warning','hr')", ""],
    ["daily batches within limits", "UPDATE assignment SET pregunta_id = (SELECT a2.pregunta_id FROM assignment a2 WHERE a2.compte_id = assignment.compte_id AND a2.day = assignment.day AND a2.slot = 0) WHERE slot = 1 AND id = (SELECT MIN(id) FROM assignment WHERE slot = 1)", ""],
  ];
  for (const [expected, sql, alsoExpected] of cases) {
    const copy = cloneDb(w.db);
    run(copy, sql);
    const f = failures(copy, at + 60_000);
    assert.ok(f.includes(expected), `${expected}: got ${JSON.stringify(f)}`);
    if (alsoExpected) assert.ok(f.includes(alsoExpected));
  }
});
