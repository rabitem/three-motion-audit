## What changes

<!-- What a user of the library sees, and why. Name the modules in backticks. Link the issue it
     closes, if any: "Closes #123". -->

## Verification

<!-- What ran and the counts: tests added or changed, examples run. Use an unchecked box for
     anything skipped and say why. -->

## Follow-ups

<!-- Known gaps or work deliberately left out. Write "None" if there are none. -->

## Checklist

- [ ] The core (`src/core/`, `src/detectors/`, `src/scenario/`) imports no renderer, React or Playwright
- [ ] Tests protect behaviour a user can observe (a report, an anomaly, a sample), not internals
- [ ] `README.md`, `AGENTS.md` and `CHANGELOG.md` updated where behaviour or the public API changed
- [ ] No secrets, personal data or local paths in the diff
