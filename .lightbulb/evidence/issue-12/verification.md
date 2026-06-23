# Issue 12 Verification

Slice: GitHub issue queue intake

Branch: `issue-intake`

## Local Verification

- `cd packages/core && bun test test/lightbulb-issue-intake.test.ts test/lightbulb-loop-runner-tick.test.ts test/lightbulb-decision-artifact.test.ts` - 17 pass, 0 fail
- `cd packages/core && bun typecheck` - pass
- `git diff --check` - pass

## Visual Evidence

- `.lightbulb/evidence/issue-12/terminal-screenshot.svg`
- `.lightbulb/evidence/issue-12/terminal-screenshot.png`

Browser and desktop screenshots are not applicable for this PR. The slice changes the core Lightbulb issue-intake
read model, focused tests, and docs only.

## Notes

Issue intake is a fakeable seam. Tests use local snapshots and do not call GitHub, launch workers, or run a model.
Ready issues produce compact routing and task-packet request handles; held, active, done, and dependency-blocked issues
are skipped with bounded reasons.
