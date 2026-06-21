## Parent

PRD: Account-Level Loop Orchestration Harness

## What to build

Add the narrowest dashboard/read-model surface that shows Lightbulb's seeded account work graph. The dashboard should make active loops, workers, gates/inbox, and artifacts visible enough to prove this is an account control plane, not just another chat transcript.

## Acceptance criteria

- [ ] A TUI route, panel, command, or read-model surface can display seeded Lightbulb graph state.
- [ ] The view includes at least one goal/loop/run, worker status, and artifact handle.
- [ ] The implementation follows existing OpenCode TUI/read-model conventions discovered in research.
- [ ] Verification does not depend on a live LLM call.

## Blocked by

Schema tracer bullet issue.
