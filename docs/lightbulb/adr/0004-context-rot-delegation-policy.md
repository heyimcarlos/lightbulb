# ADR 0004: Parent Orchestrators Delegate Before Context Rot

- Status: Accepted
- Date: 2026-06-20

## Context

A core failure mode of long `/goal` sessions is that a parent thread accumulates too much execution detail and becomes less useful. Lightbulb exists partly to prevent that failure mode.

## Decision

Parent orchestrators manage goals, loops, gates, and summaries. They delegate implementation/research into fresh child workers by default. Workers return summaries, evidence, changed files, and artifact handles. Raw logs and full transcripts remain retrievable by handle but are not pushed into parent context by default.

## Consequences

- Context remains smaller and more strategic.
- Child work can run concurrently and asynchronously.
- The harness needs explicit checkpoint, handoff, and artifact-handle mechanics.
