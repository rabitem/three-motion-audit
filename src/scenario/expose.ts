import type { MotionAudit } from '../core/motion-audit.js';
import type { MotionReport } from '../core/types.js';
import { recordScenario, type RecordScenarioOptions, type Scenario } from './record-scenario.js';

/** Where the bridge lives on `globalThis` unless `key` says otherwise. */
export const DEFAULT_BRIDGE_KEY = '__motionAudit';

export interface BridgeStatus {
  /** The scenario running now, if any. */
  running: string | null;
  frames: number;
  settled: boolean;
}

/** What a page exposes to a test driver. Everything it returns is JSON-serialisable. */
export interface MotionAuditBridge {
  readonly version: 1;
  scenarios(): string[];
  /** Runs a registered scenario and resolves with its report. One at a time. */
  run(name: string): Promise<MotionReport>;
  status(): BridgeStatus;
  /** The last finished scenario's report. */
  lastReport(): MotionReport | null;
  /** The audit's report so far, outside any scenario. */
  report(): MotionReport;
}

export interface ExposeOptions extends Omit<RecordScenarioOptions, 'name'> {
  scenarios?: Record<string, Scenario>;
  key?: string;
}

/** Puts a bridge on `globalThis[key]` so Playwright (or a person in the console) can run scenarios. Returns a function that removes it. */
export function exposeMotionAudit(audit: MotionAudit, options: ExposeOptions = {}): () => void {
  const { scenarios = {}, key = DEFAULT_BRIDGE_KEY, ...recordOptions } = options;
  let running: string | null = null;
  let last: MotionReport | null = null;

  const bridge: MotionAuditBridge = {
    version: 1,
    scenarios: () => Object.keys(scenarios),
    async run(name) {
      const scenario = scenarios[name];
      if (!scenario) throw new Error(`Unknown scenario "${name}". Registered: ${Object.keys(scenarios).join(', ') || 'none'}`);
      if (running) throw new Error(`Scenario "${running}" is still running`);
      running = name;
      try {
        last = await recordScenario(audit, scenario, { ...recordOptions, name });
        return last;
      } finally {
        running = null;
      }
    },
    status: () => ({ running, frames: audit.frames, settled: audit.isSettled() }),
    lastReport: () => last,
    report: () => audit.report(),
  };

  const scope = globalThis as unknown as Record<string, unknown>;
  scope[key] = bridge;
  return () => {
    if (scope[key] === bridge) delete scope[key];
  };
}
