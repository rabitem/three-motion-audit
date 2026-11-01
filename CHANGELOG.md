# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0, a minor version may break
the public API; the entry says how.

## [Unreleased]

## [0.1.0] - 2026-11-01

### Added

- `MotionAudit` (`createMotionAudit`): a framework-free recorder of object transforms with an
  injectable clock, roles (world or screen space, thresholds, bounds, ignored checks), severities
  and custom detectors. `DEFAULT_THRESHOLDS`, `SCREEN_THRESHOLDS` and `DEFAULT_SEVERITY` are frozen.
- Built-in detectors: `teleport`, `path-kink`, `rotation-pop`, `handoff-pop`, `handoff-gap`,
  `duplicate`, `remount-flicker`, `non-finite`, `out-of-bounds`, `offscreen` and `not-settled`.
- Scenarios: `recordScenario` and the `exposeMotionAudit` bridge, with `frames`, `wait`,
  `waitUntil`, `settle` and `event`, the `wait-timeout` and `scenario-failed` codes, and a typed,
  JSON-serialisable `MotionReport`. `assertNoAnomalies`, `findings` and `formatAnomalies` work in
  any test runner.
- `three-motion-audit/three`: `sampleScene`, `createSceneProbe`, `tagObject` and `motionTag`.
- `three-motion-audit/r3f`: `useMotionAudit` and `MotionAuditProbe`.
- `three-motion-audit/clock`: `VirtualClock` and `installVirtualClock`, with `play`, `fast` and
  `paused` modes.
- `three-motion-audit/playwright`: `waitForMotionAudit`, `runScenario`, `auditStatus`,
  `expectNoAnomalies`, `expectAnomaly` and `attachReport`.

[Unreleased]: https://github.com/rabitem/three-motion-audit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rabitem/three-motion-audit/releases/tag/v0.1.0
