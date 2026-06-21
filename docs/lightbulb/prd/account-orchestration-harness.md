# PRD: Account-Level Loop Orchestration Harness

## Problem Statement

Carlos wants Lightbulb to manage the Lightbulb account as a whole, not just run a single repo-maintenance pipeline. Today, coding agents are mostly reactive chat surfaces. Long-running work rots parent context, loses artifacts, and makes it hard to monitor concurrent loops, schedules, workers, and task state.

## Solution

Build Lightbulb as an account-level control plane on top of the OpenCode fork. The harness lets a user initialize and run concurrent/async loops, workers, schedules, and tasks; monitor and maintain them; and move artifacts bidirectionally between the harness and workers.

## User Stories

1. As an orchestrator, I want to define a durable goal so that work survives beyond one chat session.
2. As an orchestrator, I want to start recurring loops so that discovery, execution, verification, and review happen without manual prompting.
3. As a maintainer, I want child workers to run in fresh contexts so that implementation does not poison parent orchestration context.
4. As a maintainer, I want each worker to receive a bounded task packet so that it can act without rereading the whole account history.
5. As a maintainer, I want to see active loops, schedules, workers, gates, and artifacts in one dashboard so that I can steer the system.
6. As a maintainer, I want artifacts to be created by the harness itself so that repo scaffolds, files, PRDs, ADRs, plans, and reports are first-class outputs.
7. As a maintainer, I want artifacts to flow from workers back to the harness so that verification, review, and later loops can consume them.
8. As a maintainer, I want context thresholds to force checkpoint/delegation so that long-running agents do not degrade silently.
9. As a maintainer, I want GitHub issues to be the executable queue so that AFK agents can pick up ready-for-agent work.
10. As a maintainer, I want PRDs and ADRs attached to issue work so that architecture decisions are inspectable.
11. As a maintainer, I want schedules to have cost/context/approval budgets so that recurring loops cannot run forever.
12. As a maintainer, I want a run tree so that I can trace parent goals to child workers and artifacts.

## Implementation Decisions

- Fork/reuse OpenCode for TUI, session, diff, tool, and provider substrate.
- Add a separate Lightbulb schema namespace instead of overloading OpenCode sessions.
- Use GitHub Issues plus Matt Pocock-style triage labels for work routing.
- Use vertical-slice implementation issues rather than horizontal layer tickets.
- Treat artifacts as typed objects with lineage, checksums, producer/consumer edges, and retention policy.
- Keep execution workers isolated by session/worktree and merge only through gates.

## Testing Decisions

- Prefer behavior-level tests at the highest stable seam.
- For schema work, test durable CRUD and restart/reload behavior.
- For TUI/dashboard work, verify rendered state from a seeded local database.
- For orchestration loops, test transitions and stop conditions without requiring real model calls.
- For artifact flow, test lineage and consume/produce transitions as external behavior.

## Out of Scope

- Full hosted multi-tenant service.
- Autonomous merging to upstream without human approval.
- Replacing OpenCode's provider/session runtime in v0.
- Heavy Temporal/DBOS infrastructure in v0.

## Further Notes

The first implementation proof should demonstrate: create goal → create loop → spawn worker → produce artifact → register artifact → show run tree/dashboard → enforce context/gate policy.
