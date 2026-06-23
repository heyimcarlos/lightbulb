# Issue 9 Worker Lifecycle Evidence

## Scope

- Fixed the durable worker-launch lifecycle so an active running launch can refresh to terminal `complete`.
- `complete` clears the active launch key, marks the worker and task packet complete, marks the run complete, and leaves the existing review gate status unchanged.
- Added a regression test proving a post-completion retry is skipped instead of creating duplicate worker ownership.

## Verification

- `cd packages/core && bun test test/lightbulb-worker-launch.test.ts`
  - 8 pass, 0 fail.
- `cd packages/core && bun test test/lightbulb-loop-runner-tick.test.ts test/lightbulb-worker-launch.test.ts`
  - 12 pass, 0 fail.
- `cd packages/core && bun typecheck`
  - pass.
- `git diff --check`
  - pass.

## Notes

- No live model, worker process, or external runtime is launched by these tests.
- Final report ingestion remains a separate slice in #18; this PR only makes the task-packet/worker-spawn lifecycle accurately represent a completed worker handle.
