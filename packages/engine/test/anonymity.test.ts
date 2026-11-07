// Anonymity: nothing per account may leave the engine through the HR API or the aggregate tables.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { all, run } from "../src/db.ts";
import { audienceFor } from "../src/alarms.ts";
import { runEngineJob } from "../src/job.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { alarmCounts, getConfig, listAlarms, listInsights, setConfig, type AlarmStatus, type Viewer } from "../src/hr.ts";
import { generateWorld, type World } from "./world-gen.ts";

const STATUSES: AlarmStatus[] = ["open", "acknowledged", "action_linked", "resolved"];
let world: World;
let ids: string[];
let names: string[];
let leadership: number;

before(() => {
  world = generateWorld("anon-1", { accountsPerCollective: 22, days: 45, distinctiveIds: true, participation: 0.8 });
  setConfig(world.db, { questions_per_day: 3 });
  runEngineJob(world.db, { now: world.clock.now });
  ids = all<{ id: string }>(world.db, "SELECT id FROM compte").map((a) => a.id);
  names = all<{ username: string }>(world.db, "SELECT username FROM compte").map((a) => a.username);
  leadership = all<{ id: number }>(world.db, "SELECT id FROM domini WHERE nom = 'Lideratge'")[0]!.id;
  // Alarms planted across audiences, collectives, domains and statuses, on top of whatever the job opened.
  for (const [c, d, audience] of [[1, 1, "hr_manager"], [1, leadership, "hr"], [2, 3, "hr_manager"], [null, 4, "hr"], [1, 5, "hr"]] as const)
    for (const status of STATUSES)
      run(
        world.db,
        `INSERT INTO senyal (tipus, descripcio, collectiu_id, domini_id, periode, n, confianca, severity, status, audience, created_at, suprimit)
         VALUES ('sharp_drop', 'planted alarm', ?, ?, '2026-09', 25, 80, 'warning', ?, ?, '2026-09-20 10:00:00', 0)`,
        c, d, status, audience,
      );
});

const viewers = (): Viewer[] => [{ role: "hr" }, { role: "manager", collectiuId: 1 }, { role: "manager", collectiuId: 2 }];

function leaks(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  return [...ids, ...names].filter((s) => text.includes(s));
}

test("HR API output never contains an account id or username", () => {
  for (const v of viewers()) {
    assert.deepEqual(leaks(listInsights(world.db, v, { periode: "all", includeSuppressed: true })), [], `insights ${JSON.stringify(v)}`);
    assert.deepEqual(leaks(listAlarms(world.db, v, { status: STATUSES })), [], `alarms ${JSON.stringify(v)}`);
    assert.deepEqual(leaks(alarmCounts(world.db, v)), []);
  }
  assert.deepEqual(leaks(getConfig(world.db)), []);
  assert.ok(listInsights(world.db, { role: "hr" }, { periode: "all" }).length > 20, "the world must produce insights to make this meaningful");
});

test("no HR-facing object carries a field named after an account", () => {
  const forbidden = /compte|account|username|user_?id|person|respondent|employee/i;
  const keys = (x: unknown, out = new Set<string>()): Set<string> => {
    if (Array.isArray(x)) x.forEach((e) => keys(e, out));
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) (out.add(k), keys(v, out));
    return out;
  };
  const all_ = [
    ...listInsights(world.db, { role: "hr" }, { periode: "all", includeSuppressed: true }),
    ...listAlarms(world.db, { role: "hr" }, { status: STATUSES }),
  ];
  assert.deepEqual([...keys(all_)].filter((k) => forbidden.test(k)), []);
});

test("managers never see audience 'hr' alarms, Lideratge alarms or other collectives", () => {
  for (const collectiuId of [1, 2]) {
    const v: Viewer = { role: "manager", collectiuId };
    const seen = listAlarms(world.db, v, { status: STATUSES });
    assert.ok(seen.length > 0, "manager should see their own hr_manager alarms");
    for (const a of seen) {
      assert.equal(a.audience, "hr_manager", `alarm ${a.id}`);
      assert.equal(a.collectiuId, collectiuId, `alarm ${a.id} is from another collective`);
      assert.notEqual(a.domainId, leadership, `alarm ${a.id} is a Lideratge alarm`);
    }
    // A manager cannot widen the view with query filters.
    for (const q of [{ collectiuId: 3 - collectiuId }, { collectiuId: null }, { domainId: leadership }, {}]) {
      const wide = listAlarms(world.db, v, { status: STATUSES, ...q });
      assert.ok(wide.every((a) => a.collectiuId === collectiuId && a.audience === "hr_manager" && a.domainId !== leadership), `query ${JSON.stringify(q)}`);
    }
    const insights = listInsights(world.db, v, { periode: "all", includeSuppressed: true, collectiuId: 3 - collectiuId });
    assert.ok(insights.length > 0 && insights.every((i) => i.collectiuId === collectiuId), "manager insights limited to own collective");
    const counts = alarmCounts(world.db, v);
    assert.equal(counts.critical + counts.warning + counts.info, listAlarms(world.db, v).length);
  }
  // HR does see the hr-only ones, so the filter is what hides them.
  assert.ok(listAlarms(world.db, { role: "hr" }, { status: STATUSES }).some((a) => a.audience === "hr" && a.domainId === leadership));
});

test("audienceFor: Lideratge and company-wide alarms are always HR only", () => {
  for (const type of ["sharp_drop", "sustained_decline", "changepoint_cluster", "polarisation", "low_confidence", "improvement", "feble"] as const)
    for (const c of [null, 1, 2, 3, 4]) {
      assert.equal(audienceFor(type, c, leadership, leadership), "hr", `${type} ${c}`);
      if (c === null) assert.equal(audienceFor(type, c, 1, leadership), "hr");
    }
});

test("detail_json never holds per-person values", () => {
  const rows = all<{ id: number; kind: string; n: number; detail_json: string }>(world.db, "SELECT id, kind, n, detail_json FROM insight WHERE detail_json IS NOT NULL");
  assert.ok(rows.length > 20);
  const walk = (x: unknown, path: string, row: { id: number; kind: string }) => {
    if (Array.isArray(x)) {
      // Lists are small groupings (shifts), never one entry per person.
      assert.ok(x.length <= 10, `${row.kind}#${row.id} ${path}: list of ${x.length}`);
      x.forEach((e, i) => walk(e, `${path}[${i}]`, row));
    } else if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) {
        assert.ok(!/compte|account|username|person|respondent|employee/i.test(k), `${row.kind}#${row.id}: key ${path}.${k}`);
        walk(v, `${path}.${k}`, row);
      }
      const n = (x as { n?: unknown }).n;
      if (typeof n === "number" && "score" in x) assert.ok(n >= DEFAULT_CONFIG.minGroupSize, `${row.kind}#${row.id} ${path}: group of ${n} shown`);
    } else if (typeof x === "string") assert.equal(leaks(x).length, 0, `${row.kind}#${row.id} ${path}: ${x}`);
  };
  for (const r of rows) walk(JSON.parse(r.detail_json), "$", r);
});

test("alarm descriptions and the whole senyal/insight tables mention no account", () => {
  assert.deepEqual(leaks(all(world.db, "SELECT * FROM senyal")), []);
  assert.deepEqual(leaks(all(world.db, "SELECT * FROM insight")), []);
  assert.deepEqual(leaks(all(world.db, "SELECT * FROM agregat")), []);
  assert.deepEqual(leaks(all(world.db, "SELECT * FROM domain_importance")), []);
});
