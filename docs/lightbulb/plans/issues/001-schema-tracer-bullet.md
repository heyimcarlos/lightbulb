## Parent

PRD: Account-Level Loop Orchestration Harness

## What to build

Add the first durable Lightbulb account-state tracer bullet. A local fixture or test should create one account-level graph: goal → loop → run → worker → artifact. The schema must be Lightbulb-prefixed/namespaced and must not overload OpenCode session tables.

## Acceptance criteria

- [ ] Lightbulb account/work tables or equivalent durable state are separate from upstream OpenCode session state.
- [ ] A behavior-level test or fixture creates and reads a goal, loop, run, worker, and artifact.
- [ ] Artifact records include enough metadata to identify producer run/worker and a stable path/URI.
- [ ] Package-local typecheck/test command is documented in the implementation report.

## Blocked by

None - can start immediately.
