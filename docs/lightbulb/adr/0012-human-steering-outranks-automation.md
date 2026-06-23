# ADR 0012: Human Steering Outranks Automation

- Status: Accepted
- Date: 2026-06-22

## Context

Route runner wakes coalesce automation, worker reports, CI, recovery, schedules, manual runs, and human steering into one
route decision per goal route. Those signals can disagree. For example, CI may suggest advancing while a human just held
the route, or a worker report may propose a reroute while a human edited the next stop.

## Decision

When coalesced wake signals conflict, human steering has precedence over automation. Automated evidence can inform the
decision, but it must not silently override a human route edit, hold, risk constraint, or stop change.

The route event should record the consumed signals and note when automation was subordinated to human steering.

## Consequences

- User intent remains the top-level route authority.
- Automation can still surface evidence and recommended actions.
- Route-runner decisions need conflict metadata so operators can see when a human steer changed or blocked automated progress.
