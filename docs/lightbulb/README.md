# Lightbulb Harness Domain

Lightbulb is an account-level orchestration harness built on an OpenCode fork. It manages long-running agent work across goals, loops, workers, schedules, tasks, gates, and artifacts.

## Product thesis

OpenCode is the execution/session substrate. Lightbulb owns the account-level work graph:

- **Goals**: durable objectives that may span repositories, schedules, and workers.
- **Loops**: recurring discovery/execution/verification policies.
- **Workers**: isolated agent sessions or processes, usually fresh-context Codex/Hermes runs.
- **Task packets**: bounded work items passed to workers.
- **Gates**: approval, verification, budget, and context thresholds.
- **Artifacts**: files, repos, code, diffs, plans, reports, screenshots, logs, and generated assets that flow to and from the harness.

## Non-negotiables

1. Repo scanning and issue slicing is one use case, not the product boundary.
2. Parent orchestrators delegate by default; they should not rot into high-context implementation sessions.
3. Artifacts are routed work objects with lineage, not passive attachments.
4. Durable state is SQLite-local-first for v0, separated from upstream OpenCode session schema.
5. Human steering is explicit through inbox/gates, not hidden swarm behavior.

## Account Loop Profiles

An account goal may be bootstrapped with the standard discovery, implementation, debug, review/integration,
and status loop profiles. The bootstrap seam takes an account/goal reference, profile definitions, default
schedule and budget policy, current time, and storage adapters. It creates or adopts one stable loop row per profile.

Until schedule and budget tables are promoted into dedicated primitives, each loop row stores its profile state in
metadata: profile ID, enabled or disabled state, cadence, next due time, and budget envelope. Scheduler wakeups
consume the compact loop handles returned by bootstrap; they should display bounded reasons such as `missing_goal`,
`profile_disabled`, `budget_held`, `custom_policy`, or invalid profile reasons rather than worker transcripts.

Worker dispatch remains downstream of the scheduler. Discovery and status loops usually produce harness-authored
summaries or task candidates. Implementation, debug, and review/integration loops may dispatch fresh child workers only
after the loop handle is enabled, due, and inside budget. Parent/operator summaries expose created, adopted, skipped,
held, and invalid profile handles without raw prompt or worker transcript content.

## Traceable Loop Run Admission

Scheduler wakeups must admit due loops into the durable run ledger before any model, worker, or external connector runs.
Admission records the loop classification, trigger, schedule/budget snapshot, source metadata, and an append-only event.
Skipped wakeups for existing loops record `lightbulb.loop_run.skipped`; due wakeups create a queued run, advance the next
due time, and record `lightbulb.loop_run.admitted`. This keeps cron/Hermes activity traceable even when worker execution
is delegated or later fails outside the parent context.

Scheduler/controller ticks record their own account-level `lightbulb.scheduler_tick.completed` event after evaluating
the account loops. The tick event stores admitted/skipped counts and compact per-loop outcomes, including empty wakeups
where no loop exists yet. This gives paused cron, external scheduler, and recovery loops a durable trace before any
worker process exists. The dashboard read model exposes the recent tick events under `operations.schedulerTicks`, and
the text dashboard prints an `Operations` section when tick state exists.
