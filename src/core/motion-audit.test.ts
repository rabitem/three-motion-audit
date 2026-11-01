import { describe, expect, it } from 'vitest';
import { codes, createRecorder, sample } from '../test-support/fixtures.js';
import type { Detector } from './detector.js';
import { assertNoAnomalies } from './report.js';

/** Two frames at rest, then a 2-unit jump: a teleport under the defaults. */
function jump(step: ReturnType<typeof createRecorder>['step'], id = 'a', role?: string) {
  step([sample(id, [0, 0, 0], { role })]);
  step([sample(id, [0, 0, 0], { role })]);
  step([sample(id, [2, 0, 0], { role })]);
}

describe('MotionAudit configuration', () => {
  it('reports a repeated anomaly once, with a count', () => {
    const { audit, step } = createRecorder();
    // Rest, rest, jump forward: three separate teleports of the same object.
    for (let index = 0; index < 3; index++) {
      step([sample('a', [2 * index, 0, 0])]);
      step([sample('a', [2 * index, 0, 0])]);
      step([sample('a', [2 * index + 2, 0, 0])]);
    }
    expect(audit.report().anomalies).toMatchObject([{ code: 'teleport', subject: 'a', count: 3, frame: 3, t: 33.3 }]);
  });

  it('lets a severity be changed or switched off', () => {
    const asInfo = createRecorder({ severity: { teleport: 'info' } });
    jump(asInfo.step);
    expect(asInfo.audit.report()).toMatchObject({ passed: true, anomalies: [{ code: 'teleport', severity: 'info' }] });

    const off = createRecorder({ severity: { teleport: 'off' } });
    jump(off.step);
    expect(off.audit.report().anomalies).toEqual([]);
  });

  it('lets a role ignore checks that do not apply to it', () => {
    const { audit, step } = createRecorder({ roles: { dragged: { ignore: ['teleport'] } } });
    jump(step, 'pointer', 'dragged');
    jump(step, 'card');
    expect(audit.report().anomalies.map((anomaly) => anomaly.subject)).toEqual(['card']);
  });

  it('applies role thresholds on top of the defaults, to that role only', () => {
    const { audit, step } = createRecorder({ roles: { projectile: { thresholds: { maxSpeed: 500 } } } });
    jump(step, 'bullet', 'projectile');
    jump(step, 'card');
    for (const x of [0, 0, 10]) step([sample('rocket', [x, 0, 0], { role: 'projectile' })]); // 600 units/s
    expect(audit.report().anomalies.map((anomaly) => anomaly.subject)).toEqual(['card', 'rocket']);
  });

  it('scales distance defaults by the unit of the scene, but not explicit thresholds', () => {
    const scaled = createRecorder({ unit: 10 });
    jump(scaled.step);
    for (const x of [0, 0, 20]) scaled.step([sample('b', [x, 0, 0])]);
    expect(scaled.audit.report().anomalies.map((anomaly) => anomaly.subject)).toEqual(['b']);

    const explicit = createRecorder({ unit: 10, thresholds: { maxSpeed: 30, minTeleportDistance: 0.2 } });
    jump(explicit.step);
    expect(codes(explicit.audit)).toEqual(['teleport']);
  });

  it('judges screen-space roles by where they appear, not where they are in the world', () => {
    const { audit, step } = createRecorder({ roles: { hud: { space: 'screen' } } });
    const screen = (centreX: number) => ({ minX: centreX - 0.05, maxX: centreX + 0.05, minY: -0.9, maxY: -0.8 });
    step([sample('badge', [0, 0, 0], { role: 'hud', screen: screen(0) })]);
    step([sample('badge', [0, 0, 0], { role: 'hud', screen: screen(0) })]);
    step([sample('badge', [5, 3, 0], { role: 'hud', screen: screen(0) })]);
    expect(codes(audit)).toEqual([]);

    step([sample('badge', [5, 3, 0], { role: 'hud', screen: screen(0.6) })]);
    expect(codes(audit)).toEqual(['teleport']);
  });

  it('uses the screen thresholds for screen-space roles', () => {
    const screen = (centreX: number) => ({ minX: centreX - 0.05, maxX: centreX + 0.05, minY: -0.9, maxY: -0.8 });
    const jumpBy = (distance: number) => {
      const { audit, step } = createRecorder({ roles: { hud: { space: 'screen' } } });
      for (const centreX of [0, 0, distance]) step([sample('badge', [0, 0, 0], { role: 'hud', screen: screen(centreX) })]);
      return codes(audit);
    };
    expect(jumpBy(0.3)).toEqual(['teleport']); // 18 NDC/s: slower than the world maxSpeed, still a jump on screen
    expect(jumpBy(0.2)).toEqual([]); // under the screen minTeleportDistance 0.25
  });

  it('does not read undrawn frames as a jump after a continuity break', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 5; index++) step([sample('a', [index * 0.1, 0, 0])]);
    audit.breakContinuity();
    for (let index = 0; index < 5; index++) step([sample('a', [3 + index * 0.1, 0, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('forgets a scene that went away as a whole', () => {
    const { audit, step } = createRecorder();
    step([sample('hand:A', [0, 0, 0], { entity: 'A' })]);
    step([]);
    audit.forgetObjects();
    step([sample('table:A', [3, 0, 0], { entity: 'A' })]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('runs custom detectors and records app-level anomalies', () => {
    const tooMany: Detector = {
      name: 'crowd',
      endFrame(ctx) {
        if (ctx.tracks().length > 2) ctx.flag('crowd', `${ctx.tracks().length} objects on screen`);
      },
    };
    const { audit, step } = createRecorder({ detectors: [tooMany], severity: { 'one-at-a-time': 'warn' } });
    step([sample('a', [0, 0, 0]), sample('b', [1, 0, 0]), sample('c', [2, 0, 0])]);
    audit.flag('one-at-a-time', 'b started while a was moving', { subject: 'b' });
    expect(audit.report().anomalies).toMatchObject([
      { code: 'crowd', severity: 'error' },
      { code: 'one-at-a-time', severity: 'warn', subject: 'b' },
    ]);
  });
});

describe('MotionReport', () => {
  it('summarises the run in relative time with a timeline of mounts, unmounts and events', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0])]);
    audit.event('input', { key: 'space' });
    step([sample('a', [0, 0, 0]), sample('b', [1, 0, 0])]);
    step([sample('b', [1, 0, 0])]);
    const report = audit.report();
    expect(report).toMatchObject({ version: 1, passed: true, frames: 3, durationMs: 33.3, objects: 2 });
    expect(report.timeline.map(({ kind, label, frame }) => [kind, label, frame])).toEqual([
      ['mount', 'a', 1],
      ['event', 'input', 1],
      ['mount', 'b', 2],
      ['unmount', 'a', 3],
    ]);
  });

  it('caps the timeline and says how much it dropped', () => {
    const { audit, step } = createRecorder({ maxTimelineEntries: 2 });
    for (let index = 0; index < 5; index++) step([sample(`object-${index}`, [index, 0, 0])]);
    const labels = audit.report().timeline.map((entry) => entry.label);
    expect(labels).toEqual(['object-0', 'object-1', 'timeline truncated (7 entries dropped)']);
  });

  it('returns a snapshot that later frames do not change', () => {
    const { audit, step } = createRecorder();
    jump(step);
    const earlier = audit.report();
    for (const x of [2, 2, 4]) step([sample('a', [x, 0, 0])]);
    expect(earlier.anomalies).toMatchObject([{ code: 'teleport', count: 1 }]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'teleport', count: 2 }]);
  });

  it('starts over on reset', () => {
    const { audit, step } = createRecorder();
    jump(step);
    audit.reset();
    step([sample('a', [2, 0, 0])]);
    expect(audit.report()).toMatchObject({ frames: 1, objects: 1, anomalies: [], durationMs: 0 });
  });

  it('fails an assertion with one line per finding', () => {
    const { audit, step } = createRecorder();
    jump(step);
    expect(() => assertNoAnomalies(audit.report())).toThrow(/found 1 anomaly:\nerror teleport @33ms frame 3: a moved 2 units in one frame/);
    expect(() => assertNoAnomalies(audit.report(), { ignore: ['teleport'] })).not.toThrow();
  });
});
