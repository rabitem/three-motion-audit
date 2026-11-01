# three-motion-audit

[![CI](https://github.com/rabitem/three-motion-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/rabitem/three-motion-audit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/three-motion-audit)](https://www.npmjs.com/package/three-motion-audit)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Catch animation glitches in three.js and react-three-fiber scenes before your players do. The audit
records the transforms of the objects you name, frame by frame, and reports what a viewer would see
go wrong: an object that teleports, a path that kinks, a rotation that snaps, a seam where one
object hands over to another, a duplicate, a flicker. Screenshot diffs can't see these, because
every single frame looks fine.

- **Framework-free core.** Feed it `{ id, position, quaternion }` samples from any renderer.
- **Thin adapters** for three.js, react-three-fiber and Playwright, and a virtual clock that makes
  runs deterministic.
- **Typed, JSON-serialisable reports** with a timeline, ready to assert on in CI.

## Quick start

```sh
npm install --save-dev three-motion-audit
```

**react-three-fiber.** Tag what you want watched, drop the probe into the canvas, and make the
audit available to tests:

```tsx
import { createMotionAudit, exposeMotionAudit } from 'three-motion-audit';
import { MotionAuditProbe, motionTag } from 'three-motion-audit/r3f';

const audit = createMotionAudit();
exposeMotionAudit(audit, {
  scenarios: {
    'open-chest': async (ctx) => {
      openChest();
      await ctx.waitUntil(() => chestIsOpen(), { label: 'the chest to open' });
    },
  },
});

<Canvas>
  <mesh userData={motionTag('chest-lid', { role: 'prop' })}>…</mesh>
  <MotionAuditProbe audit={audit} />
</Canvas>;
```

**Playwright.** Run the scenario in the page and assert on the report:

```ts
import { test } from '@playwright/test';
import { expectNoAnomalies, runScenario } from 'three-motion-audit/playwright';

test('the chest opens smoothly', async ({ page }) => {
  await page.goto('/'); // add ?clock=fast once the virtual clock is installed (see "Deterministic runs")
  expectNoAnomalies(await runScenario(page, 'open-chest'));
});
```

A failure lists every finding:

```
Scenario "open-chest" found 1 anomaly:
error teleport @812ms frame 49: chest-lid moved 1.2 units in one frame
```

**Plain three.js.** Sample after each render:

```ts
import { createMotionAudit } from 'three-motion-audit';
import { createSceneProbe, tagObject } from 'three-motion-audit/three';

const audit = createMotionAudit();
const probe = createSceneProbe(audit, scene, camera);
tagObject(lid, 'chest-lid', { role: 'prop' });

renderer.setAnimationLoop(() => {
  animate();
  renderer.render(scene, camera);
  probe.sample();
});
```

Without a browser test, call `audit.finish()` once when the animation is over (or `audit.report()`
for the report so far) and check it with `assertNoAnomalies(report)` in any test runner.

### Adapters

`createSceneProbe(audit, scene, camera, options)`, the `MotionAuditProbe` props and
`useMotionAudit(audit, options)` (the hook form of the probe) take the same `SampleOptions`:

- **`select(object)`** returns a tag (`{ id, entity?, role? }`) or null, to track objects you have
  not tagged. By default only objects tagged with `motionTag` or `tagObject` are tracked.
- **`screen`** projects each object's bounds to the screen, which `offscreen` and screen-space roles
  need. Defaults to true when there is a camera.
- **`camera: '<id>'`** tracks the camera itself, with role `camera`, so camera cuts show up as
  teleports.

`sampleScene(root, camera, options)` from `three-motion-audit/three` returns the samples without
recording them.

## What it catches

| Code | Meaning | Default |
| --- | --- | --- |
| `teleport` | A long, fast step that breaks from the motion before it. A smooth fast throw is fine. | error |
| `path-kink` | A sudden change of direction or speed, such as a snap out of a hover or a seam between two animation phases. Steady curvature, like an orbit, is fine. | error |
| `rotation-pop` | A spin that jumps suddenly, or one too fast to read. | error |
| `handoff-pop` | An entity jumps when another object takes it over, for example a card moving from the hand mesh to the table mesh. | error |
| `handoff-gap` | Blank frames between the old object and the new one. | error |
| `duplicate` | One entity drawn by two objects for longer than a handoff takes. | error |
| `remount-flicker` | An object unmounts and mounts again almost at once (a React key change, a Suspense fallback). | error |
| `non-finite` | NaN or Infinity in a transform. | error |
| `out-of-bounds` | A visible object outside its role's bounds, such as a card under the table. | error |
| `offscreen` | An object that came to rest partly outside the viewport. | warn |
| `not-settled` | Something still moves when the audit finishes. | error |
| `wait-timeout`, `scenario-failed` | A scenario waited too long, or threw. | error |

A run passes when it has no errors or warnings. Each anomaly is reported once per code and subject,
with a count and the frame and time it first happened; `teleport` and `path-kink` anomalies also
carry the object's recent path in `data.history`.

### Identity: id, entity and role

- **`id`** names one rendered object. The same id in two frames is the same object.
- **`entity`** is what the object shows. A card drawn first by the hand and then by the table is one
  entity with two ids, so the audit can check the handoff between them. It defaults to the id.
- **`role`** selects per-kind options: thresholds, bounds, checks to ignore, and the space that
  motion is judged in.

## Configuration

```ts
const audit = createMotionAudit({
  unit: 0.5, // a typical moving object is half a scene unit across; scales distance defaults
  thresholds: { maxSpeed: 40 },
  bounds: { minY: 0 }, // nothing below the floor
  roles: {
    // Follows the pointer, not a script.
    dragged: { ignore: ['teleport', 'path-kink', 'rotation-pop'] },
    // Rides on the camera: judge it by where it appears on screen.
    hud: { space: 'screen' },
    // Camera cuts are intended here (track the camera with `camera: 'camera'` on the probe).
    camera: { ignore: ['teleport'] },
  },
  severity: { offscreen: 'info', 'one-at-a-time': 'warn' },
});
```

Distances are in scene units and rates are per second of clock time, so the checks hold on a
virtual clock and on an uneven real one alike. The defaults (`DEFAULT_THRESHOLDS`) assume `unit: 1`,
a typical moving object about one scene unit across; they were tuned on objects about 0.6 units
across. `unit` (the size of a typical moving object, default 1) scales the distance
and speed defaults, and most scenes only need it. Explicit `thresholds`, at audit or role level, are
absolute: `unit` does not scale them, so the `maxSpeed: 40` above stays 40.

For a `space: 'screen'` role, distances and speeds are in normalised device coordinates (the
viewport spans 2), messages say NDC, `SCREEN_THRESHOLDS` replaces the distance defaults, and `unit`
does not apply.

### Rules of your own

App-level rules, such as "one card flies at a time" or "the result waits for every landing", belong
to your app. Report them with `audit.flag(code, message)`, or write a detector:

```ts
import type { Detector } from 'three-motion-audit';

const oneAtATime: Detector = {
  name: 'one-at-a-time',
  endFrame(ctx) {
    const flying = ctx.tracks().filter((track) => track.role === 'card' && track.speed > 1);
    if (flying.length > 1) ctx.flag('one-at-a-time', `${flying.map((track) => track.id).join(', ')} fly together`);
  },
};
createMotionAudit({ detectors: [oneAtATime] });
```

Detectors see each object's recent history, speed and angular speed, recent departures, and the
resolved thresholds for its role. They can hook `mount`, `update`, `unmount`, `endFrame` and `finish`,
and `reset` to drop per-object state when the audit is reset or its objects are forgotten.

## Deterministic runs: the virtual clock

```ts
// install-clock.ts: the first import of your test entry (`import './install-clock';`), before the scene.
import { installVirtualClock } from 'three-motion-audit/clock';

const mode = new URLSearchParams(location.search).get('clock');
if (mode === 'fast' || mode === 'play') installVirtualClock({ mode });
```

Keep it in its own module. A module's imports run before its body, so an install written inline in
the entry would run after three, React and your scene have loaded.

The virtual clock replaces `performance.now`, `Date.now`, timers and `requestAnimationFrame`, and
advances in fixed 60 Hz steps. `useFrame`, `THREE.Clock` and timeouts then see the same timing on
every run, however slow the CI runner is. `fast` runs frames back to back, `play` at the display's
pace (`speed` virtual frames per display frame), and `paused` only when told to:
`installVirtualClock` returns the clock, so call `clock.step(n)` or `clock.advance(ms)`.

## Scenarios

`exposeMotionAudit(audit, { scenarios })` puts a small bridge on `window.__motionAudit`. A scenario
drives the scene through its context: `frames(n)`, `wait(ms)`, `waitUntil(predicate)`, `settle()`
and `event(label)`. When it returns, the run waits until nothing moves, runs the end-of-audit checks
and returns the report. You can run scenarios from Playwright (`runScenario(page, name)`), from the
console (`await __motionAudit.run('open-chest')`), or in-process with `recordScenario(audit, scenario)`.
Each run starts from a fresh audit unless `reset: false` is passed to `exposeMotionAudit` or
`recordScenario`.

The Playwright helpers are `waitForMotionAudit`, `runScenario`, `auditStatus`, `expectNoAnomalies`
(with `severities` and `ignore` filters), `expectAnomaly(report, code, subject?)` and `attachReport`.

## The report

```ts
interface MotionReport {
  version: 1;
  scenario?: string;
  passed: boolean;
  frames: number;
  durationMs: number;
  objects: number;
  anomalies: Anomaly[]; // { code, severity, t, frame, message, subject?, count, data? }
  timeline: TimelineEntry[]; // mounts, unmounts and your events, in run time
}
```

## Examples

[`examples/`](examples) has the same scene twice, in plain three.js and in react-three-fiber. A box
slides, then lifts. With `?pop`, the lift starts from a stale position, and the audit reports a
`teleport`. The Playwright suite in [`examples/e2e`](examples/e2e) asserts both outcomes in Chromium.

```sh
npm install
npm run examples   # http://localhost:5173
npm run build && npx playwright install chromium && npm run e2e
```

## Development

`npm run typecheck`, `npm test` (Vitest), `npm run build`, and `npm run check:package` (publint,
are-the-types-wrong and a packed-size budget). CI runs all of these, then the examples in Chromium.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE).
