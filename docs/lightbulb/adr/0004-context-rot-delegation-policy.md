# ADR 0004: Parent Orchestrators Delegate Before Context Rot

- Status: Accepted
- Date: 2026-06-20

## Context

A core failure mode of long `/goal` sessions is that a parent thread accumulates too much execution detail and becomes less useful. Lightbulb exists partly to prevent that failure mode.

## Decision

Parent orchestrators manage goals, loops, gates, and summaries. They delegate implementation/research into fresh child workers by default. Workers return summaries, evidence, changed files, and artifact handles. Raw logs and full transcripts remain retrievable by handle but are not pushed into parent context by default.

Continuity must come from durable loop memory rather than accumulated chat. The parent keeps the destination, current
route, current stop, budgets, risks, gates, and decisions. Git history, route revisions, issue/PR state, artifacts, run
reports, and compact worker summaries provide the thread of what happened across fresh workers.

Context policy is explicit per stop. Executable and verification stops usually delegate into fresh task-specific worker
contexts, with worktree isolation when file changes may collide. Tiny steering or UI-only stops may remain in the current
context when durable route state is enough.

Lightbulb enforces the first gate policy as a pure state machine before any live model call is involved. A policy observes the current run state, including context tokens, cost, approval state, and verification state, and returns one of four outcomes:

- `continue`: the run may proceed and the policy gate is marked passed.
- `checkpoint`: the current worker must checkpoint and delegate before continuing; the run is blocked behind a policy gate.
- `blocked`: approval or verification is still pending or failed; the run remains blocked with a visible reason.
- `stopped`: a hard stop or cost ceiling ended the run; the policy gate records the stop reason.

Context bundles are the compact manifest assembled immediately before worker dispatch. A bundle is not the task packet itself: the task packet tells the worker what to do, while the context bundle records the bounded issue instructions, parent goal/loop references, PRD/ADR/decision handles, relevant artifact handles, verification expectations, checksums, and excerpts the packet may point at.

Context bundles are also not general artifacts or worker final reports. They are harness-authored context_manifest artifacts with source fingerprints so retries can reuse the same manifest when issue, artifact, decision, and policy evidence is unchanged. Worker final reports flow back after execution as report or run-report artifacts; they summarize what happened and point to produced evidence. Raw transcripts and oversized logs stay outside bundles and task packets unless a future explicit retrieval flow opens them by handle.

The parent/dashboard read model exposes policy gates and blocked reasons so parent orchestrators can steer by handles and summaries instead of rehydrating child transcripts.

## Consequences

- Context remains smaller and more strategic.
- Child work can run concurrently and asynchronously.
- The harness needs explicit checkpoint, handoff, and artifact-handle mechanics.
- Worker dispatch can hold before spawn when decision, context, cost, approval, or raw-transcript policy blocks bundle assembly.
- Gate decisions can be tested without provider access or a live LLM.
