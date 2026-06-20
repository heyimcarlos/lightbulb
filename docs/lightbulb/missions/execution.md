# Long-Running Goal: Execute First Lightbulb Spine Slice

You are an xhigh Codex implementation worker.

Build the smallest working implementation slice that proves Lightbulb is more than docs.

Scope:

- Add Lightbulb-prefixed durable schema/state where it best fits the OpenCode fork.
- Add a fixture or test seam that creates account/goal/loop/run/worker/artifact records.
- Add a narrow dashboard/read model surface if feasible in the same slice.
- Add behavior-level tests for state transitions and artifact lineage.

Hard boundaries:

- Do not rename the entire OpenCode product yet.
- Do not implement hosted/multi-tenant mode.
- Do not push or open a PR.
- If architectural uncertainty blocks implementation, write the blocker with exact files to `.lightbulb/runs/execution-blockers.md` and continue with a testable smaller slice.

Final report: `.lightbulb/runs/execution-final.md` with changed files, tests run, and remaining issues.
