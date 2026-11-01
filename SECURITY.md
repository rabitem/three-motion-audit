# Security policy

## Report a vulnerability

Report privately through GitHub's private vulnerability reporting:
<https://github.com/rabitem/three-motion-audit/security/advisories/new>. Only the maintainers can
read the report. Do not open a public issue, pull request or discussion for a vulnerability, and do
not post details elsewhere before a fix is released.

A useful report has:

- what is affected (the entry point, such as `three-motion-audit/clock`, and the function) and the
  version or commit you tested;
- the steps to reproduce it, or a proof of concept;
- the impact: what an attacker gains, and what they need first;
- a suggested fix, if you have one.

## Supported versions

Security fixes go into the latest release and `main`. Before 1.0, only the latest minor version is
supported.

## Scope

three-motion-audit is a development and test dependency. It runs inside the page under test and in
the Playwright test process; it opens no network connections and stores nothing.

In scope:

- the published package: the core, the `three`, `r3f`, `clock` and `playwright` entry points;
- the bridge that `exposeMotionAudit` puts on `globalThis`, and what a page script can make the test
  process do through it;
- the GitHub Actions workflows and scripts in `.github/` and `scripts/`.

Out of scope:

- vulnerabilities in three.js, React, react-three-fiber, Playwright or other dependencies
  themselves. Report those upstream; tell us if our use of them makes the problem worse;
- shipping the audit, the bridge or the virtual clock in a production build. They are test tools:
  the virtual clock replaces the page's timers, and the bridge lets any script in the page run
  scenarios;
- scanner output without a demonstrated impact.

## Secrets

The repository holds no secrets, and the workflows use only the token GitHub provides. Publishing
to npm uses npm trusted publishing (OpenID Connect) from `.github/workflows/release.yml`. If you
find a credential in the repository or its history, report it as a vulnerability.
