# ADR 0011: Route Runner Wakes Coalesce Per Goal Route

- Status: Accepted
- Date: 2026-06-22

## Context

The route runner is event-driven first, so a single goal route can receive several wake signals at nearly the same time:
worker reports, CI events, human steering, manual runs, recovery, and schedule ticks. If each signal starts an independent
route decision, the system can duplicate work, skip evidence, or race route edits against worker dispatch.

## Decision

Lightbulb allows only one active route decision per goal route. Concurrent wake signals are stored as pending wake
reasons, merged into the next route decision, and recorded as consumed by the route event that used them.

The decision lease belongs to the durable route state, not to a chat session. A later wake may run after the active
decision persists its event or releases the lease.

## Consequences

- CI, worker reports, human steering, recovery, manual runs, and schedules can arrive freely without racing route logic.
- Operators can see which signals shaped a route transition.
- The route runner needs a durable active-decision lease and pending-wake ledger per goal route.
