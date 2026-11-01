# Contributing to three-motion-audit

Thanks for helping. This page covers how to set up, how a change reaches `main`, what CI checks and
where the conventions are. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
Report security problems privately, as described in [SECURITY.md](SECURITY.md), never as an issue
or a pull request.

## Set up

1. Fork the repository and clone your fork.
2. Use a Node.js version that `engines` in `package.json` allows (`.nvmrc` names the major version).
3. Run `npm install`.

`npm run examples` serves the examples at <http://localhost:5173>. [AGENTS.md](AGENTS.md) explains
where code belongs.

## Pick something to work on

- Look through the open issues. Issues are filed from the templates in `.github/ISSUE_TEMPLATE/`.
  Blank issues are disabled.
- A false positive or a missed glitch needs a reproduction: the samples, or a small scene.
- Comment on the issue before you start something large, such as a new detector or adapter, so the
  approach is agreed first.

## Branch and pull request flow

1. Branch from an up-to-date `main`: `<type>/<kebab-topic>`, for example `fix/kink-after-hidden`.
   Types are `feat`, `fix`, `refactor`, `chore`, `ci`, `docs` and `test`.
2. Keep one concern per pull request. Tests and docs ship in the same pull request as the behaviour
   they cover.
3. Title the pull request `type(scope): what a user gets`, in lower case without a full stop, for
   example `fix(detectors): no path kink right after an object reappears`. Pull requests are
   squash-merged, and the title becomes the commit subject on `main`.
4. Fill in `.github/PULL_REQUEST_TEMPLATE.md`, and add an entry under `Unreleased` in
   [CHANGELOG.md](CHANGELOG.md) for anything a user notices.
5. Wait for CI. A maintainer merges once CI is green and review comments are resolved.

## What CI checks

Every pull request to `main`, and every push to it, runs `.github/workflows/ci.yml`:

| Job | Steps |
| --- | --- |
| `Verify library` (Node 22 and 24) | `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:package` |
| `Examples in Chromium` | `npm ci`, `npm run build`, then `npx playwright test`: both examples, clean and with the seeded pop |

`npm run check:package` runs publint, are-the-types-wrong and the packed-size limit in
`scripts/check-size.mjs`. Run the same commands before you push.

Dependabot opens the dependency pull requests (`.github/dependabot.yml`), and proposes a release
only after it has been public for seven days (`cooldown`). Minor and patch updates that touch only
`package.json` and `package-lock.json` merge automatically once every check has passed
(`.github/workflows/dependabot-auto-merge.yml`); majors need review.

## Tests

Tests live next to the code they cover, as `*.test.ts`, and run in Node with Vitest. Every test
protects something a user can observe: an anomaly in the report, a sample from a scene, a timer
firing on the virtual clock. Feed detectors samples through `createRecorder` in
`src/test-support/fixtures.ts` and assert on the report, not on internal state. The browser suite
in `examples/e2e/` proves that the adapters work in a real page.

## Releases

Maintainers release from `main`: move the `Unreleased` entries in `CHANGELOG.md` under the new
version, set `version` in `package.json`, and publish a GitHub release tagged `v<version>`. The
release workflow (`.github/workflows/release.yml`) publishes to npm with provenance once publishing
is switched on for the repository.

## Licence of contributions

three-motion-audit is licensed under the MIT licence (see [LICENSE](LICENSE)). By opening a pull
request you agree that your contribution is licensed under the same terms, and that you have the
right to submit it. There is no contributor licence agreement.
