# ADR 0005: Durable Goal Lifecycle

## Status

Accepted

## Context

Lightbulb goals are account-level orchestration objects.
They must survive beyond one chat or worker session.
They remain addressable by stable external references such as GitHub issue URLs, PRD handles,
or operator-provided goal IDs.

OpenCode sessions are execution transcripts for model/tool turns.
A session may contribute work to a goal, but it is not the goal.
Treating a long-running objective as a session would tie account orchestration to one context window.
Resumed or delegated work would otherwise look like duplicate work.

## Decision

Store goals as durable Lightbulb rows scoped to an account, with optional owner identity and stable source reference.
A lifecycle seam creates a goal or adopts an existing goal when the caller reuses the goal ID.
It also adopts by the same account-scoped source reference.

Goal statuses are lifecycle state, not provider activity state:

- `active` means the harness may schedule or attach loop work.
- `held` means work is intentionally paused and records an optional hold reason.
- `completed` means the objective is done and may record a completion reason.
- `cancelled` and `stopped` are terminal stop states for abandoned or operator-stopped objectives.

Goal-rooted read models return bounded summaries of attached loops, runs, workers, task packets, gates,
and artifact handles.
They do not embed raw worker logs or model transcripts.
Those remain reachable through artifact/session handles when needed.

## Consequences

- Goal adoption is idempotent and does not duplicate the account work graph.
- Status transitions can be tested and operated without a live model call.
- OpenCode sessions remain execution substrate, while Lightbulb goals remain the durable account control-plane boundary.
