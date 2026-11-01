# three-motion-audit

A TypeScript library that records the transforms of named objects in a three.js or
react-three-fiber scene, frame by frame, and reports animation glitches: teleports, path kinks,
rotation pops, handoff seams, duplicates and flicker. MIT licence, ESM only, no runtime
dependencies. This file is the one guide for coding agents; `CLAUDE.md` imports it. Users read
[README.md](README.md); contributors read [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

| Path | Holds | May import |
| --- | --- | --- |
| `src/core/` | `MotionAudit` (the recorder), types, thresholds, the `Detector` contract, report helpers | `src/detectors/` |
| `src/detectors/` | The built-in detectors | `src/core/` |
| `src/scenario/` | `recordScenario` and the `exposeMotionAudit` bridge | `src/core/` |
| `src/three/` | `three-motion-audit/three`: tag objects, sample a scene | the core, `three` |
| `src/r3f/` | `three-motion-audit/r3f`: `useMotionAudit`, `MotionAuditProbe` | the core, `src/three/`, `react`, `@react-three/fiber` |
| `src/clock/` | `three-motion-audit/clock`: the virtual clock | the core's types |
| `src/playwright/` | `three-motion-audit/playwright`: run scenarios, assert on reports | the core, `src/scenario/` (bridge key and types), `@playwright/test` |
| `src/test-support/` | Builders for the tests; not built or published | anything |
| `examples/` | The same scene in three.js and R3F, and the Playwright suite in `examples/e2e/` | the package by name |

Each subpath in `package.json` `exports` is one `src/<name>/index.ts`. Peer dependencies are
optional, so the core never imports `three`, `react`, `@react-three/fiber` or `@playwright/test`.

## Rules

1. **Framework-free core.** Everything a detector needs comes through `DetectorContext`. Adapters
   turn a renderer's objects into `ObjectSample`s and nothing more.
2. **Rates per second.** Distances are in scene units and rates are per second of clock time,
   never per frame, so the checks hold on uneven real clocks. Frame counts (`graceFrames`,
   `restFrames`, …) are the exception. Distance defaults scale with `unit` (`DISTANCE_THRESHOLDS`
   in `src/core/thresholds.ts`).
3. **One owner per check.** A built-in code is raised by one detector. A new code goes into
   `BuiltInCode` and `DEFAULT_SEVERITY` together.
4. **Reports are JSON.** Everything in a `MotionReport` survives `JSON.stringify`, because the
   Playwright helpers read it across the page boundary.
5. **ESM with explicit extensions.** Relative imports end in `.js` (`module: NodeNext`).
6. **Public API.** `src/index.ts` and each adapter's `index.ts` are the public surface. Adding to
   them is a minor change; renaming or removing is a breaking one, recorded in `CHANGELOG.md`.
7. **No secrets, hosts or personal data** in the tree.

## Commands

| Command | Does |
| --- | --- |
| `npm run typecheck` | `tsc` over `src/`, then over `examples/` |
| `npm test` | Vitest: the unit tests and the Dependabot policy tests |
| `npm run build` | `tsc -p tsconfig.build.json` into `dist/` |
| `npm run check:package` | publint, are-the-types-wrong (ESM only) and the packed-size limit; needs `dist/` |
| `npm run examples` | Vite serves `examples/` at port 5173, importing the package from `src/` |
| `npm run e2e` | Playwright runs `examples/e2e/` in Chromium; needs `npx playwright install chromium` |

## Tests

Detectors are proven through `MotionAudit`: build samples with `sample()`, step frames with
`createRecorder()` from `src/test-support/fixtures.ts`, then assert on the report. Each detector has
a test that flags the glitch and one that accepts the nearest smooth motion. The three.js adapter
runs in Node against real `three` objects. The R3F probe, the bridge and the virtual clock in a page
are proven by `examples/e2e/`.

## Project skills

| Skill | Use it for |
| --- | --- |
| `detector-change` | Adding or changing a detector, an anomaly code, a threshold or a default |
| `adapter-change` | Adding or changing an entry point (`three`, `r3f`, `clock`, `playwright`, or a new one) |
