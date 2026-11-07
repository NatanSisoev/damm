// Engine simulator: drives the real engine (createEngine + submitAnswers, then runEngineJob) day by day
// on an in-memory node:sqlite database and scores its outputs against the world's ground truth.
//
//   pnpm --filter @damm/engine run sim [-- --seed=x --scale=0.4 --every=4 --config=sim/results/best-config.json --json]
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, mergeConfig, type ClosedType, type EngineConfig } from "../src/config.ts";
import type { SqlDatabase } from "../src/db.ts";
import { createEngine, type AnswerInput } from "../src/engine.ts";
import { runEngineJob } from "../src/job.ts";
import { createRng } from "../src/rng.ts";
import { createWorld, DOMAINS, SHIFTS, type World, type WorldOptions } from "./world.ts";

const SCHEMA_PATH = resolve(import.meta.dirname, "../../db/schema.sql");
const COLLECTIVE_NAMES = ["Fàbriques", "Logística", "Comercial", "Oficines"];
/** Participation scale of the default run: keeps a 92-day run under a minute (see README). */
export const DEFAULT_SIM_SCALE = 0.4;
const TYPES: ClosedType[] = ["scale10", "scale5", "yes_no", "pair", "choice"];

export interface SimOptions {
  world?: World | WorldOptions;
  /** Engine config overrides, passed to createEngine and runEngineJob. */
  config?: Partial<EngineConfig>;
  /** Run the job every n days to measure detection delay. Default 4. */
  checkpointEvery?: number;
  /** Detection threshold in combined standard errors for segment drops. Default 2. */
  detectSigmas?: number;
  /** Progress lines on stderr. */
  verbose?: boolean;
}

export interface CalibrationBucket {
  range: string;
  rows: number;
  meanConfidence: number;
  /** Share of rows with |score/10 − truth| ≤ seTolerance. */
  coverage: number;
  /** Coverage implied by the reported SE under a normal model: 2Φ(tol/se) − 1. */
  impliedCoverage: number;
}

export interface SignalResult {
  name: string;
  segment: string;
  onset: string;
  /** Day index of the onset (0 = first simulated day). */
  onsetIndex: number;
  detected: string | null;
  delayDays: number | null;
  /** True drop of the segment mean (0..10 points) at detection or at the end. */
  trueDrop: number;
  /** Estimated drop (0..10 points) at detection or at the end. */
  estimatedDrop: number;
}

export interface SimReport {
  seed: string;
  days: number;
  population: number;
  accounts: number;
  answers: number;
  runtimeMs: number;
  config: Pick<EngineConfig, "halfLifeDays" | "processNoisePerDay" | "followupZ" | "itemBiasShrinkage" | "noiseSd">;
  score: { rows: number; rmse: number; mae: number; bias: number; managerBiasShare: number };
  calibration: { rows: number; coverage: number; impliedCoverage: number; meanConfidence: number; zSd: number; buckets: CalibrationBucket[] };
  signals: SignalResult[];
  falseDrops: { flagged: number; tested: number };
  followups: {
    planted: number;
    asked: number;
    confirmedAll: number;
    confirmedLideratgeDrops: number;
    truePositives: number;
    precision: number;
    recall: number;
    f1: number;
    medianDelayDays: number | null;
  };
  questionShare: { byDomain: Record<string, number>; byType: Record<string, number>; byReason: Record<string, number> };
  /** Realised answer noise (sd of score around truth + item bias) per type vs the engine's noiseSd. */
  noise: Record<string, { realised: number; engine: number }>;
}

type Db = SqlDatabase & { close(): void };

interface AggRow {
  periode: string;
  collectiu_id: number | null;
  torn_id: number | null;
  domini_id: number;
  n: number;
  score: number;
  confidence: number;
}

function setup(world: World): Db {
  const db = new DatabaseSync(":memory:") as unknown as Db;
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  db.exec("BEGIN");
  DOMAINS.forEach((n, i) => db.prepare("INSERT INTO domini (id, nom) VALUES (?, ?)").run(i + 1, n));
  COLLECTIVE_NAMES.forEach((n, i) => db.prepare("INSERT INTO collectiu (id, nom) VALUES (?, ?)").run(i + 1, n));
  for (const s of SHIFTS) db.prepare("INSERT INTO torn (id, nom) VALUES (?, ?)").run(s.id, s.name);
  ["fabrica", "magatzem", "oficina", "comercial"].forEach((n, i) => db.prepare("INSERT INTO centre_tipus (id, nom) VALUES (?, ?)").run(i + 1, n));
  const centre = new Map(world.collectives.map((c) => [c.id, c.centreTipusId]));
  const emp = db.prepare("INSERT INTO empleat_sintetic (collectiu_id, centre_tipus_id, torn_id, es_manager) VALUES (?,?,?,?)");
  for (const p of world.people) emp.run(p.collectiuId, centre.get(p.collectiuId)!, p.tornId, p.manager ? 1 : 0);
  const acc = db.prepare(
    "INSERT INTO compte (id, collectiu_id, centre_tipus_id, torn_id, es_manager, username, password_hash, salt) VALUES (?,?,?,?,?,?,'x','x')",
  );
  for (const p of world.accounts) acc.run(p.accountId!, p.collectiuId, centre.get(p.collectiuId)!, p.tornId, p.manager ? 1 : 0, `u_${p.accountId}`);
  const q = db.prepare(
    `INSERT INTO pregunta (id, domini_id, collectiu_id, text, tipus, facet, polarity, options_json, is_followup, estat)
     VALUES (?,?,NULL,?,?,?,?,?,?,'aprovada')`,
  );
  for (const it of world.items)
    q.run(it.id, it.domainId, it.text, it.type, it.facet, it.polarity, it.options ? JSON.stringify(it.options) : null, it.isFollowup ? 1 : 0);
  db.exec("COMMIT");
  return db;
}

// Abramowitz–Stegun 7.1.26.
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const coverageFor = (tol: number, se: number) => (se <= 0 ? 1 : erf(tol / se / Math.SQRT2));

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : NaN;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function lastDayOfPeriod(periode: string): string {
  const [y, m] = periode.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function runSim(opts: SimOptions = {}): SimReport {
  const t0 = performance.now();
  const world = opts.world && "items" in opts.world ? opts.world : createWorld(opts.world as WorldOptions | undefined);
  const cfg: EngineConfig = mergeConfig(structuredClone(DEFAULT_CONFIG), opts.config);
  const every = opts.checkpointEvery ?? 4;
  const k = opts.detectSigmas ?? 2;
  const db = setup(world);
  const dayMs = (t: number) => Date.parse(`${world.dates[t]}T09:00:00Z`);
  let clock = dayMs(0);
  const engine = createEngine({ db, redact: (s) => s, now: () => clock, config: opts.config });
  const itemById = new Map(world.items.map((i) => [i.id, i]));
  const tIndex = new Map(world.dates.map((d, t) => [d, t]));
  const rng = createRng(`answers|${world.seed}`);

  const residuals: Record<ClosedType, number[]> = { scale10: [], scale5: [], yes_no: [], pair: [], choice: [] };
  const events: { accountId: string; domainId: number; dir: number; t: number }[] = [];
  const checkpoints: { t: number; rows: AggRow[] }[] = [];
  let answers = 0;

  const readAgg = (periode?: string) =>
    (periode
      ? db.prepare("SELECT periode, collectiu_id, torn_id, domini_id, n, score, confidence FROM agregat WHERE suprimit = 0 AND periode = ?").all(periode)
      : db.prepare("SELECT periode, collectiu_id, torn_id, domini_id, n, score, confidence FROM agregat WHERE suprimit = 0").all()) as unknown as AggRow[];
  const confirmedToday = db.prepare("SELECT compte_id, domini_id, confirmed_change_dir AS dir FROM person_domain_state WHERE confirmed_change_at = ?");

  for (let t = 0; t < world.days; t++) {
    clock = dayMs(t);
    for (const p of world.accounts) {
      const batch = engine.getDailyBatch(p.accountId!);
      const out: AnswerInput[] = [];
      for (const it of batch.items) {
        if (it.answered) continue;
        const wi = itemById.get(it.questionId);
        if (!wi) continue;
        const a = world.answer(rng, p, wi, t);
        residuals[wi.type].push(a.score - (world.level(p.idx, wi.domainId, t) + wi.bias + (p.manager ? world.managerBias : 0)));
        out.push({ preguntaId: it.questionId, valorNum: a.valorNum, answerMs: a.answerMs });
      }
      if (out.length) answers += engine.submitAnswers(p.accountId!, out).accepted.length;
    }
    for (const r of confirmedToday.all(world.dates[t]!) as { compte_id: string; domini_id: number; dir: number }[])
      events.push({ accountId: r.compte_id, domainId: r.domini_id, dir: r.dir, t });

    const last = t === world.days - 1;
    if ((t + 1) % every === 0 || last) {
      runEngineJob(db, { now: Date.parse(`${world.dates[t]}T23:00:00Z`), config: opts.config });
      checkpoints.push({ t, rows: readAgg(world.dates[t]!.slice(0, 7)) });
      if (opts.verbose) process.stderr.write(`  day ${t + 1}/${world.days} ${world.dates[t]} answers=${answers}\n`);
    }
  }
  const finalT = world.days - 1;
  const finalRows = readAgg();

  // --- score error and calibration -------------------------------------------------------------
  const truthAt = (r: AggRow, t: number) => world.trueMean(r.collectiu_id, r.collectiu_id === null ? "any" : r.torn_id ?? "any", r.domini_id, t);
  const seOf = (conf: number) => cfg.seTolerance * (1 - conf / 100);
  const errs: number[] = [];
  for (const r of finalRows) {
    const ref = Math.min(finalT, tIndex.get(lastDayOfPeriod(r.periode)) ?? finalT);
    errs.push(r.score - 10 * truthAt(r, ref));
  }
  const managerShare = mean(
    finalRows.map((r) => {
      const acc = world.accounts.filter((p) => (r.collectiu_id === null || p.collectiuId === r.collectiu_id) && (r.torn_id === null || p.tornId === r.torn_id));
      return acc.length ? (10 * world.managerBias * acc.filter((p) => p.manager).length) / acc.length : 0;
    }),
  );

  const calRows: { conf: number; err: number }[] = [];
  for (const c of checkpoints) for (const r of c.rows) calRows.push({ conf: r.confidence, err: r.score / 10 - truthAt(r, c.t) });
  const tol = cfg.seTolerance;
  const buckets: CalibrationBucket[] = [
    [0, 25],
    [25, 50],
    [50, 75],
    [75, 100.01],
  ].map(([lo, hi]) => {
    const rows = calRows.filter((x) => x.conf >= lo! && x.conf < hi!);
    return {
      range: `${lo}-${Math.min(100, hi!)}`,
      rows: rows.length,
      meanConfidence: r3(mean(rows.map((x) => x.conf))),
      coverage: r3(mean(rows.map((x) => (Math.abs(x.err) <= tol ? 1 : 0)))),
      impliedCoverage: r3(mean(rows.map((x) => coverageFor(tol, seOf(x.conf))))),
    };
  });
  const zs = calRows.filter((x) => x.conf > 0).map((x) => x.err / seOf(x.conf));

  // --- planted segment signals: delay until the collective score drops by k combined SEs ---------
  const segRow = (rows: AggRow[], c: number, d: number) => rows.find((r) => r.collectiu_id === c && r.torn_id === null && r.domini_id === d);
  function detect(c: number, d: number, onset: number) {
    const before = checkpoints.filter((x) => x.t < onset).at(-1);
    const base = before && segRow(before.rows, c, d);
    if (!before || !base) return null;
    const seB = seOf(base.confidence);
    for (const cp of checkpoints.filter((x) => x.t >= onset)) {
      const now = segRow(cp.rows, c, d);
      if (!now) continue;
      const drop = (base.score - now.score) / 10;
      if (drop >= k * Math.hypot(seB, seOf(now.confidence)))
        return { t: cp.t, est: base.score - now.score, truth: 10 * (world.trueMean(c, "any", d, before.t) - world.trueMean(c, "any", d, cp.t)) };
    }
    const end = segRow(checkpoints.at(-1)!.rows, c, d);
    return { t: null, est: end ? base.score - end.score : NaN, truth: 10 * (world.trueMean(c, "any", d, before.t) - world.trueMean(c, "any", d, finalT)) };
  }
  const signals: SignalResult[] = world.segmentSignals.map((s) => {
    const r = detect(s.collectiuId, s.domainId, s.onset);
    return {
      name: s.name,
      segment: `${COLLECTIVE_NAMES[s.collectiuId - 1]} × ${DOMAINS[s.domainId - 1]}`,
      onset: world.dates[s.onset]!,
      onsetIndex: s.onset,
      detected: r && r.t !== null ? world.dates[r.t]! : null,
      delayDays: r && r.t !== null ? r.t - s.onset : null,
      trueDrop: r ? r3(r.truth) : NaN,
      estimatedDrop: r ? r3(r.est) : NaN,
    };
  });
  // Same rule on every collective × domain without a planted signal, from each signal's onset.
  let flagged = 0;
  let tested = 0;
  const planted = new Set(world.segmentSignals.map((s) => `${s.collectiuId}|${s.domainId}`));
  for (const s of world.segmentSignals)
    for (const c of world.collectives)
      for (let d = 1; d <= DOMAINS.length; d++) {
        if (planted.has(`${c.id}|${d}`)) continue;
        const r = detect(c.id, d, s.onset);
        if (!r) continue;
        tested++;
        if (r.t !== null) flagged++;
      }

  // --- follow-ups vs planted personal drops ----------------------------------------------------
  const drops = new Map(world.personalDrops.map((x) => [x.accountId, x]));
  const lidDrops = events.filter((e) => e.domainId === 2 && e.dir === -1);
  const isTrue = (e: (typeof events)[number]) => {
    const p = drops.get(e.accountId);
    return !!p && e.domainId === p.domainId && e.t >= p.onset && e.t <= p.onset + 30;
  };
  const trueEvents = lidDrops.filter(isTrue);
  const caught = new Map<string, number>();
  for (const e of trueEvents) if (!caught.has(e.accountId)) caught.set(e.accountId, e.t - drops.get(e.accountId)!.onset);
  const precision = lidDrops.length ? trueEvents.length / lidDrops.length : 0;
  const recall = drops.size ? caught.size / drops.size : 0;
  const asked = (db.prepare("SELECT COUNT(*) AS n FROM assignment WHERE reason = 'followup' AND answered_at IS NOT NULL").get() as { n: number }).n;

  // --- question share ----------------------------------------------------------------------------
  const share = (sql: string) => {
    const rows = db.prepare(sql).all() as { k: string | number; n: number }[];
    const total = rows.reduce((s, r) => s + r.n, 0);
    return rows.map((r) => [r.k, r.n / total] as const);
  };
  const byDomain = Object.fromEntries(
    share("SELECT p.domini_id AS k, COUNT(*) AS n FROM assignment a JOIN pregunta p ON p.id = a.pregunta_id GROUP BY k ORDER BY k").map(([k2, v]) => [
      DOMAINS[Number(k2) - 1]!,
      r3(v),
    ]),
  );
  const byType = Object.fromEntries(
    share("SELECT p.tipus AS k, COUNT(*) AS n FROM assignment a JOIN pregunta p ON p.id = a.pregunta_id GROUP BY k ORDER BY k").map(([k2, v]) => [k2, r3(v)]),
  );
  const byReason = Object.fromEntries(share("SELECT reason AS k, COUNT(*) AS n FROM assignment GROUP BY k ORDER BY k").map(([k2, v]) => [k2, r3(v)]));

  db.close();
  return {
    seed: world.seed,
    days: world.days,
    population: world.people.length,
    accounts: world.accounts.length,
    answers,
    runtimeMs: Math.round(performance.now() - t0),
    config: {
      halfLifeDays: cfg.halfLifeDays,
      processNoisePerDay: cfg.processNoisePerDay,
      followupZ: cfg.followupZ,
      itemBiasShrinkage: cfg.itemBiasShrinkage,
      noiseSd: cfg.noiseSd,
    },
    score: {
      rows: errs.length,
      rmse: r3(Math.sqrt(mean(errs.map((e) => e * e)))),
      mae: r3(mean(errs.map(Math.abs))),
      bias: r3(mean(errs)),
      managerBiasShare: r3(managerShare),
    },
    calibration: {
      rows: calRows.length,
      coverage: r3(mean(calRows.map((x) => (Math.abs(x.err) <= tol ? 1 : 0)))),
      impliedCoverage: r3(mean(calRows.map((x) => coverageFor(tol, seOf(x.conf))))),
      meanConfidence: r3(mean(calRows.map((x) => x.conf))),
      zSd: r3(Math.sqrt(mean(zs.map((z) => z * z)))),
      buckets,
    },
    signals,
    falseDrops: { flagged, tested },
    followups: {
      planted: drops.size,
      asked,
      confirmedAll: events.length,
      confirmedLideratgeDrops: lidDrops.length,
      truePositives: caught.size,
      precision: r3(precision),
      recall: r3(recall),
      f1: r3(precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0),
      medianDelayDays: median([...caught.values()]),
    },
    questionShare: { byDomain, byType, byReason },
    noise: Object.fromEntries(TYPES.map((t) => [t, { realised: r3(sd(residuals[t])), engine: cfg.noiseSd[t] }])),
  };
}

/** Human-readable summary. */
export function formatReport(r: SimReport, title = "Engine simulation"): string {
  const L: string[] = [];
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  L.push(`${title}  (seed ${r.seed}, ${r.days} days, ${r.accounts}/${r.population} accounts, ${r.answers} answers, ${(r.runtimeMs / 1000).toFixed(1)} s)`);
  L.push(
    `config: half_life=${r.config.halfLifeDays} process_noise=${r.config.processNoisePerDay} followup_z=${r.config.followupZ} shrinkage=${r.config.itemBiasShrinkage} noise=${JSON.stringify(r.config.noiseSd)}`,
  );
  L.push(`score vs truth (0..10, ${r.score.rows} rows): RMSE ${r.score.rmse}  MAE ${r.score.mae}  bias ${r.score.bias}  (manager bias accounts for ~${r.score.managerBiasShare})`);
  L.push(
    `confidence calibration (${r.calibration.rows} rows): |err| ≤ tol in ${pct(r.calibration.coverage)}, implied by SE ${pct(r.calibration.impliedCoverage)}, mean confidence ${r.calibration.meanConfidence}, z rms ${r.calibration.zSd} (1 = calibrated)`,
  );
  for (const b of r.calibration.buckets)
    L.push(`  confidence ${b.range.padEnd(7)} rows ${String(b.rows).padStart(4)}  coverage ${pct(b.coverage).padStart(6)}  implied ${pct(b.impliedCoverage).padStart(6)}`);
  for (const s of r.signals)
    L.push(
      `signal ${s.name} (${s.segment}, onset ${s.onset}): ${s.detected ? `detected ${s.detected}, delay ${s.delayDays} d` : "NOT detected"}; true drop ${s.trueDrop}, estimated ${s.estimatedDrop}`,
    );
  L.push(`false segment drops: ${r.falseDrops.flagged}/${r.falseDrops.tested} control collective × domain tests`);
  const f = r.followups;
  L.push(
    `follow-ups: ${f.asked} asked, ${f.confirmedAll} confirmed changes (${f.confirmedLideratgeDrops} Lideratge drops); planted ${f.planted}, caught ${f.truePositives}; precision ${f.precision} recall ${f.recall} F1 ${f.f1}; median delay ${f.medianDelayDays ?? "-"} d`,
  );
  L.push(`question share by domain: ${Object.entries(r.questionShare.byDomain).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}`);
  L.push(`  by type: ${Object.entries(r.questionShare.byType).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}; by reason: ${Object.entries(r.questionShare.byReason).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}`);
  L.push(`answer noise sd, realised vs engine: ${Object.entries(r.noise).map(([k, v]) => `${k} ${v.realised}/${v.engine}`).join(", ")}`);
  return L.join("\n");
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]!] = m[2] ?? "true";
  }
  return out;
}

export function loadConfigFile(path: string): Partial<EngineConfig> {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { config?: Partial<EngineConfig> } & Partial<EngineConfig>;
  return raw.config ?? raw;
}

export const isMain = (url: string) => !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const world = { seed: args.seed ?? "damm-sim", participationScale: Number(args.scale ?? DEFAULT_SIM_SCALE), days: args.days ? Number(args.days) : undefined };
  const config = args.config ? loadConfigFile(resolve(process.cwd(), args.config)) : undefined;
  const report = runSim({ world, config, checkpointEvery: args.every ? Number(args.every) : undefined, verbose: !args.json });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report, config ? `Engine simulation (${args.config})` : "Engine simulation (default config)"));
}
