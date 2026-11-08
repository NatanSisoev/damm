// Health checks for an engine database. Read-only: they only run SELECTs. Used by scripts/health.ts and its test.
import { MIN_GROUP_SIZE } from "@damm/shared";
import { ENGINE_VERSION } from "../src/config.ts";
import { all, one, type SqlDatabase } from "../src/db.ts";
import { toMs } from "../src/time.ts";

export interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface HealthOptions {
  /** Wall-clock time, injectable for tests. */
  now?: number;
  /** A live system's last job must be at most this old. Default 30 minutes. */
  maxJobAgeMin?: number;
  /** Answers may arrive between job runs, but not more than this long ago. Default 30 minutes. */
  maxLagMin?: number;
}

const DAY_MS = 86_400_000;

export function runHealth(db: SqlDatabase, opts: HealthOptions = {}): Check[] {
  const now = opts.now ?? Date.now();
  const maxAge = (opts.maxJobAgeMin ?? 30) * 60_000;
  const maxLag = (opts.maxLagMin ?? 30) * 60_000;
  const checks: Check[] = [];
  const count = (sql: string, ...p: (string | number)[]) => one<{ n: number }>(db, sql, ...p)?.n ?? 0;
  const check = (name: string, bad: number, okDetail: string, badDetail: string) =>
    checks.push({ name, status: bad === 0 ? "pass" : "fail", detail: bad === 0 ? okDetail : badDetail });

  const answers = count("SELECT COUNT(*) AS n FROM resposta");
  const aggregates = count("SELECT COUNT(*) AS n FROM agregat");
  checks.push({ name: "data present", status: answers > 0 && aggregates > 0 ? "pass" : "fail", detail: `${answers} answers, ${aggregates} aggregate rows` });

  // --- ranges ---
  check("answer scores in [0,1]", count("SELECT COUNT(*) AS n FROM resposta WHERE score IS NOT NULL AND (score < 0 OR score > 1)"), "all scores within range", "resposta.score out of range");
  check(
    "aggregates in range",
    count(
      `SELECT COUNT(*) AS n FROM agregat WHERE suprimit = 0 AND (score IS NULL OR confidence IS NULL OR consensus IS NULL OR score < 0 OR score > 10
         OR confidence < 0 OR confidence > 100 OR consensus < 0 OR consensus > 100 OR mitjana < 1 OR mitjana > 5)`,
    ),
    "score 0..10, confidence and consensus 0..100",
    "agregat has values outside score 0..10 / confidence, consensus 0..100",
  );
  check(
    "domain importance in range",
    count("SELECT COUNT(*) AS n FROM domain_importance WHERE suprimit = 0 AND (importance IS NULL OR importance < 0 OR importance > 1)"),
    "importance 0..1",
    "domain_importance outside 0..1",
  );
  check(
    "personal state in range",
    count("SELECT COUNT(*) AS n FROM person_domain_state WHERE level < 0 OR level > 1 OR variance <= 0 OR variance > 1 OR n < 1"),
    "level 0..1, variance in (0,1]",
    "person_domain_state has an impossible level or variance",
  );

  // --- suppression ---
  const m = MIN_GROUP_SIZE;
  const tables: [string, string, string][] = [
    ["agregat", "mitjana IS NOT NULL OR score IS NOT NULL OR confidence IS NOT NULL OR consensus IS NOT NULL", "agregat"],
    ["domain_importance", "importance IS NOT NULL", "domain_importance"],
    ["insight", "value IS NOT NULL OR detail_json IS NOT NULL", "insight"],
    ["senyal", "confianca IS NOT NULL", "senyal"],
  ];
  for (const [table, valued] of tables) {
    const bad = count(`SELECT COUNT(*) AS n FROM ${table} WHERE n < ${m} AND (suprimit = 0 OR ${valued})`);
    check(`suppression: ${table}`, bad, `every row with n < ${m} is suppressed with NULL values`, `${bad} rows with n < ${m} are visible or carry values`);
  }
  const hidden = count("SELECT COUNT(*) AS n FROM senyal WHERE suprimit = 1 AND status = 'open'");
  checks.push({ name: "suppressed alarms", status: "pass", detail: `${hidden} open alarms currently suppressed (n < ${m}); never shown by the HR API` });

  // --- no NaN / infinity ---
  const bad: string[] = [];
  for (const { name } of all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
    for (const col of all<{ name: string }>(db, `SELECT name FROM pragma_table_info('${name}')`)) {
      const n = count(
        `SELECT COUNT(*) AS n FROM "${name}" WHERE (typeof("${col.name}") = 'real' AND abs("${col.name}") > 1e300) OR (typeof("${col.name}") = 'text' AND "${col.name}" IN ('NaN','Infinity','-Infinity'))`,
      );
      if (n > 0) bad.push(`${name}.${col.name} (${n})`);
    }
  }
  check("no NaN or infinity", bad.length, "no non-finite numbers in any table", `non-finite values in ${bad.join(", ")}`);

  // --- engine metadata and freshness ---
  const version = one<{ value: string }>(db, "SELECT value FROM engine_config WHERE key = 'engine_version'")?.value;
  const lastJob = one<{ value: string }>(db, "SELECT value FROM engine_config WHERE key = 'last_job_at'")?.value;
  if (!version) checks.push({ name: "engine_version present", status: "fail", detail: "engine_config has no engine_version: the job has never completed" });
  else checks.push({ name: "engine_version present", status: JSON.parse(version) === ENGINE_VERSION ? "pass" : "warn", detail: `db ${version}, code ${ENGINE_VERSION}` });

  if (!lastJob) checks.push({ name: "last job time recent", status: "fail", detail: "no last_job_at: the job has never run" });
  else {
    const last = toMs(JSON.parse(lastJob) as string);
    const newest = one<{ d: string | null }>(db, "SELECT MAX(data) AS d FROM resposta")?.d;
    const newestMs = newest ? toMs(newest) : null;
    const lag = newestMs !== null ? newestMs - last : 0;
    const live = newestMs !== null && now - newestMs < DAY_MS;
    const age = now - last;
    const fmt = (ms: number) => `${Math.round(ms / 60_000)} min`;
    if (lag > maxLag) checks.push({ name: "last job time recent", status: "fail", detail: `the newest answer is ${fmt(lag)} newer than the last job run (${JSON.parse(lastJob)})` });
    else if (live && age > maxAge) checks.push({ name: "last job time recent", status: "fail", detail: `answers arrived today but the last job ran ${fmt(age)} ago (limit ${fmt(maxAge)}): is the scheduler running?` });
    else
      checks.push({
        name: "last job time recent",
        status: "pass",
        detail: live ? `last job ${fmt(age)} ago` : `last job ${JSON.parse(lastJob)} covers the newest answer (historic dataset, wall-clock age not checked)`,
      });
  }

  // --- alarms ---
  const dupes = all<{ k: string; n: number }>(
    db,
    `SELECT tipus || '|' || ifnull(collectiu_id,'-') || '|' || ifnull(torn_id,'-') || '|' || ifnull(domini_id,'-') AS k, COUNT(*) AS n FROM senyal
     WHERE status IN ('open','acknowledged','action_linked') GROUP BY k HAVING COUNT(*) > 1`,
  );
  check("alarms deduplicated", dupes.length, "at most one active alarm per type, segment and domain", `duplicate active alarms: ${dupes.map((d) => `${d.k} ×${d.n}`).join(", ")}`);
  const badAudience = count(
    "SELECT COUNT(*) AS n FROM senyal s JOIN domini d ON d.id = s.domini_id WHERE d.nom = 'Lideratge' AND s.audience != 'hr'",
  ) + count("SELECT COUNT(*) AS n FROM senyal WHERE collectiu_id IS NULL AND audience != 'hr'");
  check("alarm audiences", badAudience, "Lideratge and company-wide alarms are HR only", `${badAudience} alarms would reach managers that must not`);

  // --- batches ---
  const perDay = Number(JSON.parse(one<{ value: string }>(db, "SELECT value FROM engine_config WHERE key = 'questions_per_day'")?.value ?? "3"));
  check(
    "daily batches within limits",
    count(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM assignment GROUP BY compte_id, day HAVING SUM(reason != 'need') > ${Number.isFinite(perDay) && perDay > 0 ? perDay : 3} OR COUNT(DISTINCT pregunta_id) < COUNT(*))`),
    `at most ${perDay} monitoring/follow-up questions per person per day (published needs are served on top, C18), none repeated`,
    "some account has too many or repeated questions in one day",
  );
  check(
    "answers belong to a batch",
    count("SELECT COUNT(*) AS n FROM assignment WHERE answered_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM resposta r WHERE r.compte_id = assignment.compte_id AND r.pregunta_id = assignment.pregunta_id)"),
    "every answered slot has its answer",
    "assignments marked answered without a matching resposta",
  );
  return checks;
}
