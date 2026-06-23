# ADR 0009: Route Runner Is a Durable Coordinator

- Status: Accepted
- Date: 2026-06-22

## Context

Lightbulb goals need a continuous thread of work across route stops, but a long-lived orchestrator chat accumulates
worker detail and eventually suffers from context rot and context pollution. Codex-style `/goal` continuity inside one
session is not the target shape. A loop should instead use durable memory, git history, route events, artifacts, and
worker reports to stay continuous across fresh execution contexts.

## Decision

The route runner is a durable coordinator, not a long-lived chat thread. It wakes at stop, schedule, manual, webhook,
recovery, or worker-report boundaries; loads the current route and compact loop memory from durable sources; decides
whether to advance, delegate, hold, reroute, or report; then persists a small route event.

Workers and sub-agents fill their own context windows for the task they were assigned. They return compact summaries,
evidence, changed files, and artifact handles. The route runner uses those handles as memory for the next decision
instead of ingesting full worker transcripts into one parent context.

## Consequences

- Goal continuity survives process restarts and fresh worker contexts.
- Context windows stay focused on the current decision or task.
- Git history, route events, artifacts, issues, pull requests, and worker reports become primary memory inputs for future wakes.
- The implementation needs explicit route-runner wake, memory-loading, decision, delegation, and event-persistence seams.
