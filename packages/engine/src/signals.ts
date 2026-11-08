// Per-collective domain statistics that drive the daily batch (value of information, outlier share).
// Shared by the employee-side engine and the HR "brain" view. Aggregates only: nothing here names an account.
import type { DomainSignal } from "./batch.ts";
import type { EngineConfig } from "./config.ts";
import type { SqlDatabase } from "./db.ts";
import { infoGain, segmentStats, type PersonPoint } from "./segment.ts";
import * as store from "./store.ts";
import { daysBetween, toSqlDatetime } from "./time.ts";

export interface DomainStats {
  domainId: number;
  /** Expected SE² reduction from one more answer. */
  infoGain: number;
  /** Share of recent personal |z| ≥ outlierZ (0..1). */
  outlierShare: number;
  /** People with a state in this domain. */
  people: number;
  /** Collective score 0..10, confidence and consensus 0..100 from the people's states. */
  score: number;
  confidence: number;
  consensus: number;
  /** Recent answerers counted for the outlier share. */
  recent: number;
}

export function collectiveDomainStats(db: SqlDatabase, cfg: EngineConfig, collectiuId: number, nowMs: number): DomainStats[] {
  const states = store.collectiveStates(db, collectiuId);
  const N = store.population(db).filter((p) => p.collectiuId === collectiuId).reduce((s, p) => s + p.n, 0);
  const nowSql = toSqlDatetime(nowMs);
  return store.domainIds(db).map((domainId) => {
    const mine = states.filter((s) => s.domini_id === domainId);
    const points: PersonPoint[] = mine.map((s) => ({ level: s.level, variance: s.variance, daysSince: daysBetween(s.last_at, nowSql) }));
    const recent = mine.filter((s) => daysBetween(s.last_at, nowSql) <= cfg.outlierWindowDays && s.last_z !== null);
    const outliers = recent.filter((s) => Math.abs(s.last_z!) >= cfg.outlierZ).length;
    const st = segmentStats(points, N, cfg);
    return {
      domainId,
      infoGain: infoGain(points, N, cfg),
      outlierShare: recent.length ? outliers / recent.length : 0,
      people: mine.length,
      score: st.score,
      confidence: st.confidence,
      consensus: st.consensus,
      recent: recent.length,
    };
  });
}

export function computeSignals(db: SqlDatabase, cfg: EngineConfig, collectiuId: number, nowMs: number): Omit<DomainSignal, "weight">[] {
  return collectiveDomainStats(db, cfg, collectiuId, nowMs).map(({ domainId, infoGain, outlierShare }) => ({ domainId, infoGain, outlierShare }));
}
