## Parent

PRD: Account-Level Loop Orchestration Harness

## What to build

Add the first context/gate policy transition. The harness should be able to stop, checkpoint, or require delegation when a loop/worker crosses a configured context, cost, approval, or verification threshold.

## Acceptance criteria

- [ ] Policy state machine exists at a stable seam with no live LLM dependency.
- [ ] Tests cover continue, checkpoint/delegate, blocked, and stopped outcomes.
- [ ] The dashboard/read model can expose at least one gate or blocked reason.
- [ ] Policy is documented as part of the Lightbulb domain docs.

## Blocked by

Schema tracer bullet issue.
