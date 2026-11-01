---
name: detector-change
description: "Use when adding or changing a three-motion-audit detector, an anomaly code, a threshold, a default value or a severity: a new kind of glitch, a false positive or a missed glitch, tuning DEFAULT_THRESHOLDS or SCREEN_THRESHOLDS, role options, or the Detector contract (DetectorContext, Track, Departure)."
---

# Detector change

A detector is a plain object with optional hooks (`mount`, `update`, `unmount`, `endFrame`,
`finish`, `reset`) that reads tracks through `DetectorContext` and calls `ctx.flag`. The contract is
in `src/core/detector.ts`; the recorder that calls the hooks is `src/core/motion-audit.ts`.

## Before you start

- Reproduce the case as samples. A false positive is a sequence of `sample()` frames that the
  audit flags; a missed glitch is one it accepts. That sequence becomes the test.
- Decide whether it belongs in the library. A rule about one app's choreography ("one card flies at
  a time") is a custom detector or an `audit.flag` call in that app, not a built-in.

## Adding a detector

Touch these in order:

1. `src/core/types.ts`: add the code to `BuiltInCode`.
2. `src/core/motion-audit.ts`: add its severity to `DEFAULT_SEVERITY` (the compiler requires it).
3. `src/core/thresholds.ts`: add any limit to `Thresholds` and `DEFAULT_THRESHOLDS`, with a doc
   comment that gives the unit (units, units/s, rad/s, frames, ms). A distance or speed also goes
   into `DISTANCE_THRESHOLDS`, and into `SCREEN_THRESHOLDS` if screen space needs a different value.
4. `src/detectors/<concern>.ts`: the detector factory. Check `ctx.applies(code, track)` first, read
   limits from `ctx.thresholds(track)`, and give the anomaly a `subject` (the id, the entity, or
   `old->new` for a handoff) so it deduplicates.
5. `src/detectors/index.ts`: add it to `builtInDetectors()`.
6. `src/detectors/<concern>.test.ts`: one test that flags the glitch and one that accepts the
   nearest smooth motion.
7. `README.md`: a row in "What it catches"; `CHANGELOG.md`: an entry under `Unreleased`.

## Rules

- **Per second, not per frame.** Use the point times (`TrackPoint.t`), so a slow frame does not read
  as a jump. Test uneven frame times when the check uses rates.
- **One report per glitch.** If a glitch also trips another detector (a teleport is also a large
  acceleration), the less specific detector skips it, as `pathKinkDetector` skips teleport steps.
- **Hidden objects may move.** Skip steps where either end is invisible.
- **Grace after mount.** Checks that need a path wait `graceFrames`; `breakContinuity()` resets
  `age`, so the same grace applies after undrawn frames.
- **Shared rules.** Use `stepSeconds` for the time between points, `isAtRest` for the rest test and
  `motionUnit` when a message gives a motion-space distance or speed (all in `src/core/detector.ts`,
  internal, not exported from `src/index.ts`).
- **Data is JSON.** Anomaly `data` holds plain JSON values (rounded numbers, arrays, plain objects,
  short histories), never class instances.

## Changing a default

Defaults assume `unit: 1` (a typical moving object about one unit across) and were tuned on objects
about 0.6 units across at 60 Hz. Before changing one, add the motion that motivates it as a
test, and run the examples' clean run (`npm run e2e`): it must stay clean, and the seeded pop must
still be caught.
