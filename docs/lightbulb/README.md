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
metadata: profile ID, enabled or disabled state, cadence, next due time, budget envelope, and compact registry
metadata. The registry metadata mirrors the Cobus `patterns/registry.yaml` shape: profile name, goal, cadence,
risk tier, required skills, state/read-model source, phases, human gates, starter/profile reference, readiness mode,
token-cost tier, daily cap, and early-exit requirement.

Profile bootstrap returns compact handles for created, adopted, skipped, held, and invalid profiles. The Lightbulb
service and dashboard also expose compact profile summaries for route-runner, audit, and operator decisions. Missing
or malformed registry fields are reported through bounded `invalidProfileReasons` such as
`invalid_profile_goal`, `invalid_profile_phases`, or `invalid_token_cost_tier`; callers should display those reasons
instead of raw parser failures or worker transcripts. Scheduler wakeups should continue to display bounded loop
reasons such as `missing_goal`, `profile_disabled`, `budget_held`, `custom_policy`, or invalid profile reasons.

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

## Scheduler Supervisor Passes

The recurring scheduler supervisor is the account-level controller above loop admission. A supervisor pass reads loop
schedules, budget state, active run ownership, dependency holds, recovery holds, and stale worker heartbeat state through
a fakeable storage seam. It may inspect every loop, but it admits at most one eligible loop per pass. Other loops are
recorded with bounded operator reasons such as `no_due_loops`, `budget_held`, `disabled`, `already_active`,
`dependency_held`, `stale_worker`, `recovery_required`, or `one_loop_per_pass`.

Each pass has a stable pass ID. Retrying the same pass returns the existing supervisor event and does not duplicate run
admission or worker launch state. When a loop is selected, the supervisor delegates to durable loop-run admission, which
creates a queued run, advances that loop's next due time, and stores the supervisor pass ID in the admission source. The
supervisor then records a compact `lightbulb.scheduler_supervisor.completed` event with the selected loop, selected run,
next wake time, skipped loop reasons, and compact active run, worker, and artifact handles. Raw worker prompts, model
transcripts, and logs stay out of supervisor event metadata.

After a selected loop completes normally, the next pass sees the advanced `next_due_at` and waits until that time unless
another loop is due first. If a prior run is still queued or running, the loop is held as `already_active`. If a running
worker heartbeat is stale, the loop is held as `stale_worker` so a recovery/debug pass can reconcile the existing run
before any duplicate work is admitted. Explicit dependency or recovery holds live in loop supervisor metadata until the
responsible gate clears them; once cleared, the next supervisor pass can select the loop again when its schedule and
budget are open.
