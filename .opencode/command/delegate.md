---
description: Delegate Lightbulb work to project subagents with isolated worktree, async/no-cron routing, and evidence rules.
---

Use the `lightbulb-delegate` skill to plan and dispatch this work:

$ARGUMENTS

Follow the skill exactly:

- use a fresh worktree for implementation work
- choose the smallest useful set of `lightbulb-*` subagents
- use async delegation for request-driven automation; do not create cron jobs unless the trigger is time-based
- run non-overlapping workers in parallel when useful
- verify worker claims before reporting success
- keep the final answer short

Routing rule:

- Immediate/request-driven work → async delegation to `lightbulb-*` workers.
- Long-lived durable objective → `/goal` or Kanban.
- Scheduled recurring check → automation blueprint or cron.
