// Hyperparameter tuning for the engine: random search over the docs/engine.md section 11 knobs,
// scored by the simulator against ground truth. Trials run in parallel worker threads.
//
//   node --experimental-strip-types --experimental-sqlite --no-warnings sim/tune.ts [--trials=16 --scale=0.3 --workers=3]
//
// Search on two tuning seeds, then compare default vs best on a held-out validation seed.
// Writes sim/results/best-config.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { DEFAULT_CONFIG, type EngineConfig } from "../src/config.ts";
import { createRng, type Rng } from "../src/rng.ts";
import { DEFAULT_SIM_SCALE, formatReport, isMain, runSim, type SimReport } from "./run.ts";

export type Knobs = Pick<EngineConfig, "halfLifeDays" | "processNoisePerDay" | "followupZ" | "itemBiasShrinkage" | "noiseSd">;

export const DEFAULT_KNOBS: Knobs = {
  halfLifeDays: DEFAULT_CONFIG.halfLifeDays,
  processNoisePerDay: DEFAULT_CONFIG.processNoisePerDay,
  followupZ: DEFAULT_CONFIG.followupZ,
  itemBiasShrinkage: DEFAULT_CONFIG.itemBiasShrinkage,
  noiseSd: { ...DEFAULT_CONFIG.noiseSd },
};

const uni = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();
const logUni = (r: Rng, lo: number, hi: number) => Math.exp(uni(r, Math.log(lo), Math.log(hi)));
const round = (x: number, d: number) => Number(x.toPrecision(d));

export function sampleKnobs(r: Rng): Knobs {
  return {
    halfLifeDays: Math.round(uni(r, 7, 42)),
    processNoisePerDay: round(logUni(r, 5e-5, 4e-3), 2),
    followupZ: round(uni(r, 1.8, 3.2), 2),
    itemBiasShrinkage: Math.round(logUni(r, 3, 80)),
    noiseSd: {
      scale10: round(uni(r, 0.06, 0.2), 2),
      scale5: round(uni(r, 0.08, 0.22), 2),
      yes_no: round(uni(r, 0.2, 0.5), 2),
      pair: round(uni(r, 0.12, 0.3), 2),
      choice: round(uni(r, 0.1, 0.25), 2),
    },
  };
}

/**
 * Loss, lower is better. Each term is roughly on a 0..1 scale for plausible settings:
 *   score RMSE in 0..10 points
 * + 0.5 · |ln z_rms|              (confidence calibration: z_rms = 1 is ideal)
 * + mean signal delay / 100 days  (undetected = days left after onset + 14)
 * + (1 − F1) of follow-ups vs planted personal drops
 * + 0.5 · false segment-drop rate on control segments
 */
export function loss(r: SimReport): number {
  const delays = r.signals.map((s) => s.delayDays ?? r.days - s.onsetIndex + 14);
  const delay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
  const z = Number.isFinite(r.calibration.zSd) && r.calibration.zSd > 0 ? Math.abs(Math.log(r.calibration.zSd)) : 1;
  const fpr = r.falseDrops.tested ? r.falseDrops.flagged / r.falseDrops.tested : 0;
  return r.score.rmse + 0.5 * z + delay / 100 + (1 - r.followups.f1) + 0.5 * fpr;
}

interface Job {
  id: number;
  knobs: Knobs;
  seed: string;
  scale: number;
}

function runPool(jobs: Job[], workers: number): Promise<{ job: Job; report: SimReport }[]> {
  return new Promise((done, fail) => {
    const results: { job: Job; report: SimReport }[] = [];
    let next = 0;
    let active = 0;
    const launch = () => {
      if (next >= jobs.length) {
        if (active === 0) done(results);
        return;
      }
      const job = jobs[next++]!;
      active++;
      const w = new Worker(new URL(import.meta.url), { workerData: job, execArgv: process.execArgv });
      w.once("message", (report: SimReport) => {
        results.push({ job, report });
        process.stderr.write(`  trial ${job.id} seed ${job.seed}: loss ${loss(report).toFixed(3)} (${(report.runtimeMs / 1000).toFixed(0)} s)\n`);
      });
      w.once("error", fail);
      w.once("exit", () => {
        active--;
        launch();
      });
    };
    for (let i = 0; i < Math.max(1, workers); i++) launch();
  });
}

const parseArgs = (argv: string[]): Record<string, string> =>
  Object.fromEntries(argv.flatMap((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [[m[1]!, m[2]!]] : [];
  }));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const trials = Number(args.trials ?? 16);
  const scale = Number(args.scale ?? 0.3);
  const workers = Number(args.workers ?? Math.max(1, Math.min(4, cpus().length - 1)));
  const seeds = (args.seeds ?? "tune-1,tune-2").split(",");
  const validation = args.validation ?? "damm-sim";
  const r = createRng(`tune|${args.seed ?? "0"}`);
  const t0 = performance.now();

  // Stage 1: random search on the first tuning seed (trial 0 = current defaults).
  const candidates: Knobs[] = [DEFAULT_KNOBS, ...Array.from({ length: trials }, () => sampleKnobs(r))];
  process.stderr.write(`stage 1: ${candidates.length} trials on seed ${seeds[0]}, scale ${scale}, ${workers} workers\n`);
  const s1 = await runPool(candidates.map((knobs, id) => ({ id, knobs, seed: seeds[0]!, scale })), workers);
  s1.sort((a, b) => loss(a.report) - loss(b.report));

  // Stage 2: re-score the top 3 (and the defaults) on the other tuning seeds, pick the best mean loss.
  const top = [...new Set([...s1.slice(0, 3).map((x) => x.job.id), 0])];
  const rest = seeds.slice(1);
  process.stderr.write(`stage 2: trials ${top.join(", ")} on seeds ${rest.join(", ")}\n`);
  const s2 = await runPool(rest.flatMap((seed) => top.map((id) => ({ id, knobs: candidates[id]!, seed, scale }))), workers);
  const meanLoss = (id: number) => {
    const ls = [...s1, ...s2].filter((x) => x.job.id === id).map((x) => loss(x.report));
    return ls.reduce((a, b) => a + b, 0) / ls.length;
  };
  const bestId = top.reduce((a, b) => (meanLoss(a) <= meanLoss(b) ? a : b));
  const best = candidates[bestId]!;

  // Stage 3: held-out validation seed at the default sim scale.
  process.stderr.write(`stage 3: default vs trial ${bestId} on validation seed ${validation}\n`);
  const s3 = await runPool(
    [
      { id: 0, knobs: DEFAULT_KNOBS, seed: validation, scale: DEFAULT_SIM_SCALE },
      { id: bestId, knobs: best, seed: validation, scale: DEFAULT_SIM_SCALE },
    ],
    workers,
  );
  const vDefault = s3.find((x) => x.job.knobs === DEFAULT_KNOBS)!.report;
  const vBest = s3.find((x) => x.job.knobs !== DEFAULT_KNOBS)?.report ?? vDefault;

  const out = {
    note: "Tuned by sim/tune.ts: random search on synthetic worlds with known ground truth. Synthetic data only.",
    generatedAt: new Date().toISOString().slice(0, 10),
    search: { trials, scale, tuningSeeds: seeds, validationSeed: validation, bestTrial: bestId, meanTuningLoss: Number(meanLoss(bestId).toFixed(4)), defaultTuningLoss: Number(meanLoss(0).toFixed(4)) },
    validation: { defaultLoss: Number(loss(vDefault).toFixed(4)), bestLoss: Number(loss(vBest).toFixed(4)) },
    config: best,
    engineConfigKeys: {
      half_life_days: best.halfLifeDays,
      process_noise_per_day: best.processNoisePerDay,
      followup_z: best.followupZ,
      item_bias_shrinkage: best.itemBiasShrinkage,
      noise_sd: best.noiseSd,
    },
    leaderboard: s1.slice(0, 8).map((x) => ({ trial: x.job.id, loss: Number(loss(x.report).toFixed(4)), knobs: x.job.knobs })),
  };
  const dir = resolve(import.meta.dirname, "results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "best-config.json"), JSON.stringify(out, null, 2) + "\n");
  writeFileSync(resolve(dir, "validation.txt"), `${formatReport(vDefault, "Default config")}\n\n${formatReport(vBest, `Tuned config (trial ${bestId})`)}\n`);

  console.log(`best settings (trial ${bestId}, mean tuning loss ${meanLoss(bestId).toFixed(3)} vs default ${meanLoss(0).toFixed(3)}):`);
  console.log(JSON.stringify(out.engineConfigKeys, null, 2));
  console.log(`\nvalidation seed ${validation}: loss default ${loss(vDefault).toFixed(3)} → tuned ${loss(vBest).toFixed(3)}\n`);
  console.log(formatReport(vDefault, "Default config"));
  console.log();
  console.log(formatReport(vBest, `Tuned config (trial ${bestId})`));
  console.log(`\nwrote sim/results/best-config.json in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}

if (!isMainThread) {
  const job = workerData as Job;
  parentPort!.postMessage(runSim({ world: { seed: job.seed, participationScale: job.scale }, config: job.knobs }));
} else if (isMain(import.meta.url)) {
  await main();
}
