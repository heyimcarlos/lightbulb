# ADR 0005: Route Decisions Through Artifact Gates

- Status: Accepted
- Date: 2026-06-21

## Context

Lightbulb uses GitHub issues as the executable work queue, but architecture and product decisions can be too durable to leave in chat context. A loop, issue intake step, or review gate may need an ADR, PRD decision, design discussion, or HTML review artifact before AFK worker dispatch is safe.

## Decision

Represent durable architecture and product decisions as decision artifacts backed by normal Lightbulb artifact handles. A decision artifact records its artifact handle, decision type, status, owner, reviewer, source issue or gate, and supersedes/superseded-by references.

Decision status is data-plane state: `draft`, `pending`, `accepted`, `rejected`, `superseded`, or `needs-rework`. Status transitions are database updates and do not require a live model call.

Issue routing and worker dispatch must inspect decision artifacts for the issue or gate before spawning workers. Accepted decisions allow otherwise-ready `ready-for-agent` work to dispatch. Draft, pending, needs-rework, rejected, or unresolved superseded decisions hold the issue with exact issue, gate, and artifact references. A superseded decision is resolved only when its accepted replacement is visible in the same issue or gate decision set.

Parent and operator summaries show compact decision artifact handles and status. They do not embed ADR bodies, design discussion transcripts, or HTML document contents.

## Consequences

- PRD and ADR issues can carry durable decision handles without copying discussion transcripts into parent context.
- Review gates can block AFK-safe dispatch until their decision artifact reaches an accepted replacement or terminal routing outcome.
- Worker dispatch can skip held issues deterministically and report the exact artifact/gate that caused the hold.
- Later loops can consume supersession lineage without reopening old discussion bodies by default.
