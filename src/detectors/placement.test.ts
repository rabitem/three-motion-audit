import { describe, expect, it } from 'vitest';
import { codes, createRecorder, finishedCodes, sample } from '../test-support/fixtures.js';

describe('non-finite', () => {
  it('flags a NaN position', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0])]);
    step([sample('a', [Number.NaN, 0, 0])]);
    expect(codes(audit)).toEqual(['non-finite']);
  });

  it('flags an infinite scale on mount', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [0, 0, 0], { scale: Number.POSITIVE_INFINITY })]);
    expect(codes(audit)).toEqual(['non-finite']);
  });

  it('names NaN and Infinity in its data, so they survive JSON', () => {
    const { audit, step } = createRecorder();
    step([sample('a', [Number.NaN, 1, Number.POSITIVE_INFINITY])]);
    const report = JSON.parse(JSON.stringify(audit.report()));
    expect(report.anomalies[0].data.position).toEqual(['NaN', 1, 'Infinity']);
  });
});

describe('out-of-bounds', () => {
  const options = { roles: { card: { bounds: { minY: 0 } } } };

  it('flags a visible object outside its role bounds', () => {
    const { audit, step } = createRecorder(options);
    step([sample('card', [0, 0.3, 0], { role: 'card' })]);
    step([sample('card', [0, -0.05, 0], { role: 'card' })]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'out-of-bounds', subject: 'card', data: { position: [0, -0.05, 0] } }]);
  });

  it('ignores hidden objects and roles without bounds', () => {
    const { audit, step } = createRecorder(options);
    step([sample('card', [0, -1, 0], { role: 'card', visible: false }), sample('prop', [0, -1, 0])]);
    expect(audit.report().anomalies).toEqual([]);
  });

  it('uses the audit bounds unless the role sets its own', () => {
    const { audit, step } = createRecorder({ bounds: { minY: 0 }, roles: { diver: { bounds: { minY: -5 } } } });
    step([sample('prop', [0, -1, 0]), sample('diver', [0, -1, 0], { role: 'diver' })]);
    expect(audit.report().anomalies).toMatchObject([{ code: 'out-of-bounds', subject: 'prop' }]);
  });
});

describe('offscreen', () => {
  const partlyOutside = { minX: 0.8, maxX: 1.4, minY: 0, maxY: 0.3 };

  it('warns about an object resting partly outside the viewport', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 15; index++) step([sample('a', [2, 0, 0], { screen: partlyOutside })]);
    const report = audit.report();
    expect(report.anomalies).toMatchObject([{ code: 'offscreen', severity: 'warn', subject: 'a' }]);
    expect(report.passed).toBe(false);
  });

  it('accepts an object passing through the edge on its way in', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 30; index++) {
      const x = Math.max(0, 1.4 - index * 0.05);
      step([sample('a', [x, 0, 0], { screen: { minX: x - 0.3, maxX: x + 0.3, minY: 0, maxY: 0.3 } })]);
    }
    expect(audit.report().anomalies).toEqual([]);
  });
});

describe('not-settled', () => {
  it('flags an object still moving when the audit finishes', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 10; index++) step([sample('a', [index * 0.01, 0, 0])]);
    expect(finishedCodes(audit)).toEqual(['not-settled']);
  });

  it('accepts objects at rest', () => {
    const { audit, step } = createRecorder();
    for (let index = 0; index < 10; index++) step([sample('a', [Math.min(index, 5) * 0.01, 0, 0])]);
    expect(finishedCodes(audit)).toEqual([]);
  });
});
