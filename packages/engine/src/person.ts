// Personal trajectory per account × domain: a local-level Kalman filter with outlier → follow-up logic.
// docs/engine.md section 3. Pure: state in, state out.
import type { EngineConfig } from "./config.ts";
import { addDays, daysBetween } from "./time.ts";
import { randInt, type Rng } from "./rng.ts";

export interface PersonDomainState {
  level: number;
  variance: number;
  n: number;
  lastAt: string; // SQLite datetime or day
  lastZ: number | null;
  pendingFollowupLevel: number | null;
  followupDue: string | null; // 'YYYY-MM-DD'
  confirmedChangeAt: string | null;
  confirmedChangeDir: 1 | -1 | null;
}

export interface Observation {
  /** Item-bias-adjusted score: score − bias(item). */
  y: number;
  noiseSd: number;
  at: string; // SQLite datetime
  day: string; // 'YYYY-MM-DD'
  isFollowup: boolean;
  /** Coarse formats (yes_no, pair) update the level but cannot trigger a follow-up on their own. */
  canTriggerFollowup?: boolean;
}

export type FollowupOutcome = "scheduled" | "confirmed" | "noise" | null;

export interface ObserveResult {
  state: PersonDomainState;
  z: number;
  followup: FollowupOutcome;
}

export function newPersonState(level: number, cfg: EngineConfig, at: string): PersonDomainState {
  return {
    level,
    variance: cfg.priors.variance,
    n: 0,
    lastAt: at,
    lastZ: null,
    pendingFollowupLevel: null,
    followupDue: null,
    confirmedChangeAt: null,
    confirmedChangeDir: null,
  };
}

export function observe(prev: PersonDomainState, obs: Observation, cfg: EngineConfig, rng: Rng): ObserveResult {
  const s: PersonDomainState = { ...prev };
  // Time update: knowledge about a person fades as time passes.
  const gap = daysBetween(s.lastAt, obs.at);
  const dt = Number.isFinite(gap) ? Math.max(0, gap) : 0; // a malformed date must never poison the state
  s.variance += cfg.processNoisePerDay * dt;

  const R = obs.noiseSd ** 2;
  const levelBefore = s.level;
  const z = (obs.y - s.level) / Math.sqrt(s.variance + R);
  const K = s.variance / (s.variance + R);
  s.level = s.level + K * (obs.y - s.level);
  s.variance = (1 - K) * s.variance;
  s.n += 1;
  s.lastAt = obs.at;
  s.lastZ = z;

  let followup: FollowupOutcome = null;
  if (s.pendingFollowupLevel !== null && obs.isFollowup) {
    // Resolve: is the follow-up also far from the pre-outlier level, in the same direction?
    const dir = Math.sign(levelBefore - s.pendingFollowupLevel) || Math.sign(obs.y - s.pendingFollowupLevel);
    const diff = obs.y - s.pendingFollowupLevel;
    const confirmed = Math.sign(diff) === dir && Math.abs(diff) >= cfg.confirmSigmas * obs.noiseSd;
    if (confirmed) {
      s.confirmedChangeAt = obs.day;
      s.confirmedChangeDir = dir > 0 ? 1 : -1;
    }
    s.pendingFollowupLevel = null;
    s.followupDue = null;
    followup = confirmed ? "confirmed" : "noise";
  } else if (s.pendingFollowupLevel === null && !obs.isFollowup && obs.canTriggerFollowup !== false && s.n > 1 && Math.abs(z) >= cfg.followupZ) {
    // Outlier on an established trajectory: let the filter move faster and ask again in a few days.
    s.pendingFollowupLevel = levelBefore;
    s.followupDue = addDays(obs.day, randInt(rng, cfg.followupMinDays, cfg.followupMaxDays));
    s.variance += cfg.followupInflation;
    followup = "scheduled";
  }
  return { state: s, z, followup };
}
