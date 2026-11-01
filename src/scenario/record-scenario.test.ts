import { afterEach, describe, expect, it } from 'vitest';
import type { ObjectSample } from '../core/types.js';
import { createRecorder, sample, yaw } from '../test-support/fixtures.js';
import { exposeMotionAudit, type MotionAuditBridge } from './expose.js';
import { recordScenario } from './record-scenario.js';

/** Draws `scene()` every frame until stopped, yielding between frames like a browser's render loop. */
function renderLoop(step: (samples: ObjectSample[]) => void, scene: () => ObjectSample[]) {
  let running = true;
  const loop = (async () => {
    while (running) {
      step(scene());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })();
  return async () => {
    running = false;
    await loop;
  };
}

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  await stop?.();
  stop = null;
});

/** A box that eases from x=0 to x=1 over 500ms once started. */
function slidingBox() {
  const recorder = createRecorder();
  let startedAt: number | null = null;
  const x = () => {
    if (startedAt === null) return 0;
    const progress = Math.min(1, (recorder.now() - startedAt) / 500);
    return progress * progress * (3 - 2 * progress);
  };
  stop = renderLoop(recorder.step, () => [sample('box', [x(), 0, 0])]);
  const start = () => {
    startedAt = recorder.now();
  };
  return { ...recorder, x, start };
}

describe('recordScenario', () => {
  it('drives the scene, waits for it to settle and reports', async () => {
    const { audit, x, start } = slidingBox();
    const report = await recordScenario(audit, async (ctx) => {
      await ctx.frames(2);
      start();
      ctx.event('slide');
      await ctx.waitUntil(() => x() >= 1, { label: 'the slide to end' });
    }, { name: 'slide', settleFrames: 10 });

    expect(report).toMatchObject({ scenario: 'slide', passed: true, anomalies: [] });
    expect(report.durationMs).toBeGreaterThanOrEqual(500);
    expect(report.timeline.filter((entry) => entry.kind === 'event').map((entry) => entry.label)).toEqual(['scenario started', 'slide']);
  });

  it('reports a scene that never comes to rest', async () => {
    const recorder = createRecorder();
    let frame = 0;
    stop = renderLoop(recorder.step, () => [sample('fan', [0, 0, 0], { quaternion: yaw(++frame * 0.1) })]);
    const report = await recordScenario(recorder.audit, () => {}, { timeoutMs: 300 });
    expect(report.passed).toBe(false);
    expect(report.anomalies.map((anomaly) => anomaly.code)).toEqual(['wait-timeout', 'not-settled']);
  });

  it('reports a wait that timed out, by its label', async () => {
    const { audit } = slidingBox();
    const report = await recordScenario(audit, async (ctx) => {
      expect(await ctx.waitUntil(() => false, { timeoutMs: 100, label: 'the door to open' })).toBe(false);
    });
    expect(report.anomalies).toMatchObject([{ code: 'wait-timeout', subject: 'the door to open' }]);
  });

  it('reports a scenario that throws', async () => {
    const { audit } = slidingBox();
    const report = await recordScenario(audit, () => {
      throw new Error('button not found');
    }, { name: 'broken' });
    expect(report.anomalies).toMatchObject([{ code: 'scenario-failed', subject: 'broken', message: 'The scenario threw: button not found' }]);
  });

  it('reports a wait condition that throws inside a frame, and keeps the render loop running', async () => {
    const recorder = createRecorder();
    const errors: unknown[] = [];
    stop = renderLoop((samples) => {
      try {
        recorder.step(samples);
      } catch (error) {
        errors.push(error);
      }
    }, () => [sample('box', [0, 0, 0])]);
    let calls = 0;
    const report = await recordScenario(recorder.audit, async (ctx) => {
      await ctx.waitUntil(() => {
        if (calls++ > 0) throw new Error('boom');
        return false;
      });
    }, { name: 'throws', settleFrames: 5 });
    expect(report.anomalies).toMatchObject([{ code: 'scenario-failed', subject: 'throws', message: 'The scenario threw: boom' }]);
    expect(errors).toEqual([]);
  });
});

describe('exposeMotionAudit', () => {
  it('lets a driver list and run scenarios through a global bridge', async () => {
    const { audit, start, x } = slidingBox();
    const remove = exposeMotionAudit(audit, {
      key: '__testAudit',
      settleFrames: 5,
      scenarios: {
        slide: async (ctx) => {
          start();
          await ctx.waitUntil(() => x() >= 1);
        },
      },
    });
    const bridge = (globalThis as unknown as Record<string, unknown>)['__testAudit'] as MotionAuditBridge;

    expect(bridge.scenarios()).toEqual(['slide']);
    const running = bridge.run('slide');
    expect(bridge.status().running).toBe('slide');
    await expect(bridge.run('slide')).rejects.toThrow('Scenario "slide" is still running');
    const report = await running;
    expect(report).toMatchObject({ scenario: 'slide', passed: true });
    expect(bridge.lastReport()).toEqual(report);
    expect(bridge.status()).toMatchObject({ running: null, settled: true });
    await expect(bridge.run('missing')).rejects.toThrow('Unknown scenario "missing". Registered: slide');

    remove();
    expect((globalThis as unknown as Record<string, unknown>)['__testAudit']).toBeUndefined();

    const removeOld = exposeMotionAudit(audit, { key: '__testAudit' });
    const removeNew = exposeMotionAudit(audit, { key: '__testAudit' });
    removeOld();
    expect((globalThis as unknown as Record<string, unknown>)['__testAudit']).toBeDefined();
    removeNew();
    expect((globalThis as unknown as Record<string, unknown>)['__testAudit']).toBeUndefined();
  });
});
