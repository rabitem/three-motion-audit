export type {
  Anomaly,
  AnomalyCode,
  Bounds,
  BuiltInCode,
  Clock,
  MotionReport,
  ObjectSample,
  Quat,
  ScreenBounds,
  Severity,
  TimelineEntry,
  TimelineKind,
  Vec3,
} from './core/types.js';
export type { Departure, Detector, DetectorContext, FlagOptions, MotionSpace, Track, TrackPoint } from './core/detector.js';
export { DEFAULT_THRESHOLDS, SCREEN_THRESHOLDS, type Thresholds } from './core/thresholds.js';
export {
  DEFAULT_SEVERITY,
  MotionAudit,
  createMotionAudit,
  type FrameListener,
  type MotionAuditOptions,
  type RoleOptions,
} from './core/motion-audit.js';
export { assertNoAnomalies, findings, formatAnomalies, type FindingFilter } from './core/report.js';
export {
  recordScenario,
  type RecordScenarioOptions,
  type Scenario,
  type ScenarioContext,
  type SettleOptions,
  type WaitOptions,
} from './scenario/record-scenario.js';
export { DEFAULT_BRIDGE_KEY, exposeMotionAudit, type BridgeStatus, type ExposeOptions, type MotionAuditBridge } from './scenario/expose.js';
