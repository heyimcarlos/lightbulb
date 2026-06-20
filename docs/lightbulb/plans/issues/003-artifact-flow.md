## Parent

PRD: Account-Level Loop Orchestration Harness

## What to build

Implement the first bidirectional artifact flow. A worker/run should produce an artifact; the harness should register it; a parent/orchestrator surface should consume the artifact by handle instead of embedding raw output.

## Acceptance criteria

- [ ] Artifact object includes type, path/URI, producer, status, summary, and lineage edge support.
- [ ] A test covers produce → register → consume/read transition.
- [ ] Parent-facing output is a summary plus artifact handle, not full raw logs.
- [ ] Artifact rules are documented in `docs/lightbulb/adr/0003-artifacts-are-work-objects.md` or a follow-up ADR.

## Blocked by

Schema tracer bullet issue.
