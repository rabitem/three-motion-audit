---
name: adapter-change
description: "Use when adding or changing a three-motion-audit entry point or adapter: three-motion-audit/three (sampleScene, tagObject, motionTag), /r3f (useMotionAudit, MotionAuditProbe), /clock (VirtualClock), /playwright (runScenario, expectNoAnomalies), a new renderer or test runner, package.json exports, peer dependencies, or the exposeMotionAudit bridge."
---

# Adapter change

An adapter turns a framework's world into the core's terms: renderer objects into `ObjectSample`s,
a test runner's page into bridge calls. It holds no detection logic.

## Adding an entry point

Touch these in order:

1. `src/<name>/index.ts`: the adapter. Import the framework from its package and the core by
   relative path with a `.js` extension.
2. `package.json`:
   - `exports`: a `./<name>` entry with `types` and `default` pointing into `dist/<name>/`;
   - `peerDependencies` and `peerDependenciesMeta` (optional: true) for the framework, with the
     oldest version the adapter works with;
   - `devDependencies` for the version the tests and examples use.
3. A test: a Node test against the real framework where it runs without a browser (as
   `src/three/sample-scene.test.ts` does), otherwise a case in `examples/e2e/`.
4. `examples/`: show it, if it changes how a user wires the audit.
5. `README.md` (a section and the quick start, if it is the common path), `AGENTS.md` (the layout
   table) and `CHANGELOG.md`.
6. Run `npm run build` and `npm run check:package`: publint and are-the-types-wrong must pass for
   the new subpath.

## Rules

- **The core stays framework-free.** Nothing under `src/core/`, `src/detectors/` or
  `src/scenario/` imports an adapter or a framework.
- **Sample after the render.** A probe reads transforms after the frame is drawn (R3F's
  `addAfterEffect`, after `renderer.render`), so the audit sees what the viewer saw.
- **Page and test process agree through the bridge.** The bridge (`src/scenario/expose.ts`) returns
  only JSON. A driver for another test runner calls `scenarios()`, `run(name)` and `status()` on
  `globalThis.__motionAudit`, as `src/playwright/index.ts` does.
- **The virtual clock patches globals.** It must be installed before animation code reads
  `requestAnimationFrame` or `performance.now`; keep `uninstall()` restoring every global it
  replaced.
