# ADR 0004: Parent Orchestrators Delegate Before Context Rot

- Status: Accepted
- Date: 2026-06-20

## Context

A core failure mode of long `/goal` sessions is that a parent thread accumulates too much execution detail and becomes less useful. Lightbulb exists partly to prevent that failure mode.

## Decision

Parent orchestrators manage goals, loops, gates, and summaries. They delegate implementation/research into fresh child workers by default. Workers return summaries, evidence, changed files, and artifact handles. Raw logs and full transcripts remain retrievable by handle but are not pushed into parent context by default.

Context bundles are the compact manifest assembled immediately before worker dispatch. A bundle is not the task packet
itself: the task packet tells the worker what to do, while the context bundle records the bounded issue instructions,
parent goal/loop references, PRD/ADR/decision handles, relevant artifact handles, verification expectations, checksums,
and excerpts the packet may point at.

Context bundles are also not general artifacts or worker final reports. They are harness-authored context_manifest
artifacts with source fingerprints so retries can reuse the same manifest when issue, artifact, decision, and policy
evidence is unchanged. Worker final reports flow back after execution as report or run-report artifacts; they summarize
what happened and point to produced evidence. Raw transcripts and oversized logs stay outside bundles and task packets
unless a future explicit retrieval flow opens them by handle.

## Consequences

- Context remains smaller and more strategic.
- Child work can run concurrently and asynchronously.
- The harness needs explicit checkpoint, handoff, and artifact-handle mechanics.
- Worker dispatch can hold before spawn when decision, context, cost, approval, or raw-transcript policy blocks bundle assembly.
