# ADR 0006: Goals Always Start With a Visible Route

- Status: Accepted
- Date: 2026-06-22

## Context

Lightbulb is moving away from inherited session-first product flows. A blank goal destination keeps the product flexible,
but it hides the work shape and can let long-running agent work become opaque before the user has a chance to steer it.
A fixed workflow such as `Research -> Plan -> Implement -> Review -> Fix CI -> Merge -> Report` is visible, but too
prescriptive for users who want shorter or specialized agent loops.

## Decision

Every admitted Lightbulb goal has at least one visible route. The route may begin as a small default such as `Understand
-> Do -> Verify`, but users can edit it by prompt or UI. Lightbulb defines route and stop primitives, not one mandatory
stop sequence.

Each stop may carry its own prompt, reusable skill reference, gate requirements, context policy, and delegation policy.
The default execution policy should prefer fresh worker contexts and delegation before context rot, but users may choose
shorter or specialized routes when the work calls for them.

## Consequences

- The desktop product can show goal state as a route instead of hiding work inside a session transcript.
- Route templates can teach safe patterns without becoming hard constraints.
- Stop-level context and delegation policy become first-class product configuration rather than fixed persona-agent roles.
