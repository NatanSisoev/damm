// HR-safe bindings of the engine read API to the shared DB connection.
// HR pages import this instead of getDb: only @damm/engine/hr functions (aggregate insights and alarms) are exposed.
import { getDb } from "@damm/db";
import {
  alarmCounts,
  listAlarms,
  listInsights,
  setAlarmStatus,
  startProbe,
  listProbes,
  stopProbe,
  listPool,
  getPoolQuestion,
  setQuestionActive,
  ProbeError,
  type StartProbeInput,
  type AlarmQuery,
  type AlarmStatus,
  type InsightQuery,
  type Viewer,
} from "@damm/engine/hr";

// better-sqlite3 satisfies the engine's minimal SqlDatabase at runtime; its typings are stricter.
const db = () => getDb() as unknown as Parameters<typeof listInsights>[0];

export type { PoolQuestionDetail, PoolWeek, PoolSegment, Pool, PoolQuestion, PoolSummary, PoolState, PoolReason, PoolByCollective, SetPoolStatusResult, AlarmView, AlarmStatus, InsightView, InsightDetails, Viewer, ProbeView, ProbeProgress } from "@damm/engine/hr";
export { ProbeError };

export const hrInsights = (viewer: Viewer, q?: InsightQuery) => listInsights(db(), viewer, q);
export const hrAlarms = (viewer: Viewer, q?: AlarmQuery) => listAlarms(db(), viewer, q);
export const hrAlarmCounts = (viewer: Viewer = { role: "hr" }) => alarmCounts(db(), viewer);
export const changeAlarmStatus = (id: number, status: AlarmStatus) => setAlarmStatus(db(), id, status);

// "Indagar": HR asks for more sampling of one domain in one segment. Segment-level only, never accounts.
export const hrStartProbe = (input: StartProbeInput) => startProbe(db(), input);
export const hrListProbes = (senyalId: number) => listProbes(db(), { senyalId });
export const hrStopProbe = (id: number) => stopProbe(db(), id);

// Question pool inspector: every question with delivery statistics and schedule. Aggregates only.
export const hrPool = () => listPool(db());
export const hrSetQuestionActive = (id: number, active: boolean, by: string) => setQuestionActive(db(), id, active, by);
export const hrPoolQuestion = (id: number) => getPoolQuestion(db(), id);
