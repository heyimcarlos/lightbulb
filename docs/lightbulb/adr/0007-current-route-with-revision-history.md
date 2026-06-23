# ADR 0007: Routes Have One Current Projection and Revision History

- Status: Accepted
- Date: 2026-06-22

## Context

Route editing needs to feel direct. Users should not have to navigate a version-control interface just to rename a stop,
remove a gate, or reroute around a blocker. At the same time, long-running agent work must be explainable after the fact:
operators need to know why a route changed, which stop moved, and what policy changed before a worker was dispatched.

## Decision

Lightbulb shows one current route for each goal. Editing a route updates that current route projection and records an
append-only route revision or steering event. The revision history should capture the reason, changed stops, changed gate
requirements, and changed context or delegation policy when that information is available.

## Consequences

- The desktop UI can stay simple by defaulting to the current route.
- Debugging and audit views can reconstruct how the route changed over time.
- Route steering becomes durable state rather than transient chat text.
