# ADR 0010: Route Runner Wakes Are Event-Driven First

- Status: Accepted
- Date: 2026-06-22

## Context

Lightbulb loops need automations and schedules, but route progress should not depend on cron ticks. A goal can become
ready to advance when a worker report arrives, a stop completes, a human steers the route, CI changes state, a GitHub
event lands, or recovery discovers unfinished work. Treating schedules as the primary progress engine would re-create
passive polling and make route state feel stale.

## Decision

The route runner is event-driven first. It may wake from stop completion, worker report arrival, human steering, GitHub
or CI events, manual runs, recovery, and schedules. Schedules are one wake source, useful as heartbeat, discovery cadence,
and recovery fallback, but they do not define route progress.

On each wake, the runner loads the current route and compact loop memory, decides whether to advance, delegate, hold,
reroute, or report, then persists a small route event.

## Consequences

- Routes can advance immediately when fresh evidence arrives.
- Cron remains useful without becoming the product model.
- Scheduler ticks, webhook events, manual runs, recovery runs, and worker reports need a shared route-runner admission seam.
- Duplicate or racing wakes must coalesce against the durable current route state.
