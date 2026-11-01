import type { MotionAudit } from '../core/motion-audit.js';
import type { MotionReport } from '../core/types.js';

export interface WaitOptions {
  /** Clock time the wait may take before it fails with a `wait-timeout` anomaly, ms. */
  timeoutMs?: number;
  /** Names the wait in the anomaly, completing "Waited <n>ms for …" (for example 'the door to open'). Also the anomaly's subject. */
  label?: string;
}

export interface SettleOptions extends WaitOptions {
  /** Consecutive frames with nothing moving. */
  frames?: number;
}

/** What a scenario drives the scene with. Every wait counts recorded frames, so time is the audit's clock. */
export interface ScenarioContext {
  readonly audit: MotionAudit;
  /** Resolves after `count` more frames. */
  frames(count: number): Promise<void>;
  /** Resolves once `ms` of clock time has passed in recorded frames. */
  wait(ms: number): Promise<void>;
  /** Resolves true once `predicate` holds after a frame; false, with a `wait-timeout` anomaly, after the timeout. */
  waitUntil(predicate: () => boolean, options?: WaitOptions): Promise<boolean>;
  /** Waits until nothing has moved for a number of frames. */
  settle(options?: SettleOptions): Promise<boolean>;
  /** Adds a labelled moment to the timeline. */
  event(label: string, data?: Record<string, unknown>): void;
}

export type Scenario = (ctx: ScenarioContext) => void | Promise<void>;

export interface RecordScenarioOptions {
  /** Shown in the report and in assertion messages. */
  name?: string;
  /** Consecutive frames with nothing moving that end the run. Defaults to 30. */
  settleFrames?: number;
  /** Default timeout of every wait, the final settle included, in clock ms. Defaults to 10 000. */
  timeoutMs?: number;
  /** Start from a fresh audit. Defaults to true. */
  reset?: boolean;
}

const DEFAULT_SETTLE_FRAMES = 30;
const DEFAULT_TIMEOUT_MS = 10_000;

/** Resolves on the first frame for which `done` returns true; rejects, off the render loop, if `done` throws. */
function untilFrame(audit: MotionAudit, done: (t: number) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsubscribe = audit.onFrame((_frame, t) => {
      let finished: boolean;
      try {
        finished = done(t);
      } catch (error) {
        unsubscribe();
        reject(error);
        return;
      }
      if (!finished) return;
      unsubscribe();
      resolve();
    });
  });
}

export function createScenarioContext(audit: MotionAudit, defaults: { settleFrames: number; timeoutMs: number }): ScenarioContext {
  const waitUntil = async (predicate: () => boolean, options: WaitOptions = {}): Promise<boolean> => {
    if (predicate()) return true;
    const deadline = audit.now() + (options.timeoutMs ?? defaults.timeoutMs);
    let met = false;
    await untilFrame(audit, (t) => {
      met = predicate();
      return met || t >= deadline;
    });
    if (!met) {
      const label = options.label ?? 'the condition';
      audit.flag('wait-timeout', `Waited ${options.timeoutMs ?? defaults.timeoutMs}ms for ${label}`, { subject: label });
    }
    return met;
  };

  return {
    audit,
    frames(count) {
      let left = count;
      return count <= 0 ? Promise.resolve() : untilFrame(audit, () => --left <= 0);
    },
    wait(ms) {
      const until = audit.now() + ms;
      return untilFrame(audit, (t) => t >= until);
    },
    waitUntil,
    async settle(options = {}) {
      const needed = options.frames ?? defaults.settleFrames;
      let still = 0;
      const settled = await waitUntil(() => {
        still = audit.isSettled() ? still + 1 : 0;
        return still >= needed;
      }, { timeoutMs: options.timeoutMs, label: options.label ?? 'the scene to settle' });
      if (!settled) audit.event('still moving', { ids: audit.moving().map((track) => track.id) });
      return settled;
    },
    event(label, data) {
      audit.event(label, data);
    },
  };
}

/**
 * Runs a scenario against an audit: drives the scene, waits for it to settle, runs the
 * end-of-audit checks and returns the report. Frames must keep coming while it runs
 * (a render loop, or a virtual clock that is not paused).
 */
export async function recordScenario(audit: MotionAudit, scenario: Scenario, options: RecordScenarioOptions = {}): Promise<MotionReport> {
  if (options.reset ?? true) audit.reset();
  const ctx = createScenarioContext(audit, {
    settleFrames: options.settleFrames ?? DEFAULT_SETTLE_FRAMES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  audit.event('scenario started', options.name ? { name: options.name } : undefined);
  try {
    await scenario(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit.flag('scenario-failed', `The scenario threw: ${message}`, { subject: options.name, data: { error: message } });
  }
  await ctx.settle();
  const report = audit.finish();
  return options.name ? { ...report, scenario: options.name } : report;
}
