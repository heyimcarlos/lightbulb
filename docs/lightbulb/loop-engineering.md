# Lightbulb Loop Engineering

## Decision Frame

Lightbulb is a local-first account control plane for long-running coding-agent work. The target loop system must make
scheduled work, worker dispatch, verification, human gates, run history, and harness improvement traceable in the
Lightbulb graph before model or external process execution begins.

Current paused loops showed useful behavior: cron wakeups, Hermes coder processes, worker-style reports, gates, and
status files. They were not yet a complete loop-engineering system because the scheduler/process state lived mostly
outside the durable Lightbulb account graph. Skipped runs, empty wakeups, process handles, verifier results, and harness
improvement findings were therefore hard to recover or analyze after the fact.

## Comparables

| Rank | Source | Score | Best Match | Mismatch | Use For |
| --- | --- | ---: | --- | --- | --- |
| 1 | LangChain, "The Art of Loop Engineering" | 31/35 | Four nested loops: agent, verifier, event trigger, hill-climbing trace analysis | Cloud/LangSmith examples, not local-first SQLite | Layering the Lightbulb loop spine and trace-eval loop |
| 2 | cobusgreyling/loop-engineering | 30/35 | Practical run-log, budget, state, worktree, verifier, kill-switch patterns | Mostly markdown/tooling reference, not a product schema | Operating model, multi-loop coordination, safety gates |
| 3 | Addy Osmani, "Loop Engineering" | 29/35 | Clear primitive model: automations, worktrees, skills, connectors, sub-agents, memory | Conceptual article, not implementation detail | Primary product vocabulary and failure boundaries |
| 4 | Infinite Labs `goal` skill | 24/35 | Verifiable objective preflight and anti-rabbit-hole done criteria | Goal-mode skill, not scheduler architecture | Goal contract/admission gate before autonomous work |

Scoring criteria: domain fit, stack fit, production maturity, architecture clarity, operations relevance, testing quality,
and maintainability signal.

Detailed ingestion of `cobusgreyling/loop-engineering` is recorded in
[research/cobus-loop-engineering-ingestion-2026-06-22.md](research/cobus-loop-engineering-ingestion-2026-06-22.md).
The resulting stable-v0 GitHub queue triage is recorded in
[plans/stable-loop-v0-triage-2026-06-22.md](plans/stable-loop-v0-triage-2026-06-22.md).

## What Lightbulb Should Copy

LangChain's useful stack is the separation between:

- agent loop: model/tool execution for one bounded task
- verification loop: grader/test/review feedback before completion
- event-driven loop: cron/webhook/scheduler trigger that starts work
- hill-climbing loop: trace analysis that improves prompts, tools, skills, and gates

The `loop-engineering` reference repo adds the missing operations layer: every loop pattern needs a documented cadence,
state owner, run log, token/budget cap, worktree isolation, verifier, human gates, kill switch, and multi-loop collision
rules.

It does not implement a named pickup-packet primitive. Instead, it spreads handoff context across pattern state files,
triage skill outputs, verifier inputs, `LOOP.md`, and run logs. Lightbulb should synthesize those scattered pieces into a
first-class pickup packet for `ready-for-agent`: scope, non-goals, blockers, affected packages, acceptance evidence,
preferred first verification command, full verification commands, risk/gate notes, route stop, suggested action, and
artifact handles.

Copy the upstream pattern-registry shape into Lightbulb loop profiles: ID, name, goal, cadence, risk, skills, state/read
model, phases, human gates, starter/profile reference, readiness mode, token-cost tier, daily cap, and early-exit
requirement.

Addy's article is the primary vocabulary fit for Lightbulb. The six primitives map directly:

- automations -> Lightbulb scheduler/controller ticks
- worktrees -> bounded worker dispatch handles
- skills -> durable project/loop instructions
- connectors -> GitHub, local DB, shell, future Slack/Linear/MCP tools
- sub-agents -> maker/checker worker lanes
- memory -> SQLite event/run/artifact graph, not only markdown files

Treat the Addy Osmani loop-engineering article as the product reference source for the primitive set. Lightbulb's local
architecture can go deeper on persistence, policy, and UI, but it should not drift away from the article's basic loop
shape: automations, worktrees, skills, connectors, sub-agents, and external memory.

The Infinite Labs `goal` skill contributes a key preflight rule: a loop must not start from fuzzy intent. Lightbulb goals
need explicit outcome, done evidence, scope boundary, constraints, anti-cheat criteria, progress tracking, and final
verification before autonomous execution.

Flue and Durable Streams sharpen primitives that OpenCode does not yet expose as Lightbulb-ready loop contracts. Copy
their shapes for append-only run streams, resumable offsets, explicit stream closure, idempotent producer writes, epoch
fencing, workflow admission, channel adapters, sandbox integrations, observability hooks, eval harnesses, and structured
workflow results. Adopt those shapes into Lightbulb contracts first; use a Flue-backed adapter only where it cleanly
implements the contract without making Flue-native state authoritative.

The adoption rule is OpenCode first, Flue where OpenCode cannot yet fill the need. Lightbulb should fill missing
capability gaps with Flue primitives instead of replacing OpenCode-native sessions, tools, agents, permissions, or UI
surfaces.

## Previous Loop Audit

Paused enabled cron loops:

- `f506757ca0e6` Lightbulb Issue Orchestrator
- `430ffd642d78` Lightbulb Discovery Triage Orchestrator
- `d95ed6317107` Lightbulb Review Integration Orchestrator
- `bea00f6e6deb` Lightbulb Autonomous Work Status
- `987ce1050dae` Lightbulb Failure Debug Orchestrator
- `dcbb0ed8fb4b` Lightbulb Infinite Loop Supervisor
- `ab4f89182bb8` Lightbulb PR Review Loop
- `9e42007f63ea` Lightbulb Traceability Evals Research Loop

Already paused:

- `dd0b2085fedd` Lightbulb Orchestration Supervisor
- `647b2763ca6e` Platano SDK loop watchdog

Killed active Hermes coder process groups:

- `594545` in `/home/cyberjanitor/repos/lightbulb`
- `699437` in `/home/cyberjanitor/repos/lightbulb`

Assessment:

- Good: the loop set already covered issue discovery, work status, failure debug, review integration, PR review, and
  traceability evals.
- Weak: schedule state, skipped/no-op runs, worker process identity, external process failures, and human decision gates
  were not consistently attached to durable Lightbulb goals/runs/events.
- Risk: the system could look healthy from `last_status: ok` while losing the evidence needed to explain why a loop
  skipped, duplicated work, exhausted budget, collided with another loop, or required a human.

## Target Spine

Every Lightbulb loop should use this durable spine:

1. Goal contract: explicit objective, done evidence, scope, constraints, anti-cheat criteria, and verification.
2. Route: visible current plan with editable stops and explicit context/delegation policy per stop.
3. Event/schedule wakeup: cron/webhook/manual/recovery source captured before any work.
4. Scheduler tick event: account-level `lightbulb.scheduler_tick.completed` with admitted/skipped counts.
5. Run admission ledger: due loops create queued `lightbulb_run`; skipped loops write `lightbulb.loop_run.skipped`.
6. Worker dispatch: isolated worktree/session/process handle attached to the run.
7. Maker/checker split: implementation worker and separate verifier/gate worker.
8. Artifact graph: reports, diffs, logs, test results, and decisions registered as artifacts with lineage.
9. Budget/attempt ledger: daily run count, token/cost/context caps, max attempts, and pause reasons.
10. Human inbox: explicit gate rows for risky or ambiguous decisions.
11. Hill-climbing loop: trace-analysis loop reads events/artifacts and files harness-improvement work.

## Route Boundary

Every admitted Lightbulb goal has at least one visible route. This keeps the goal understandable and steerable from the
start, even when the initial route is only a rough three-stop default such as `Understand -> Do -> Verify`.

The route is not a prescribed workflow. Users can prompt or click to change stop names, stop order, gate requirements,
and context/delegation policy. A code-maintenance goal might use `Research -> Plan -> Implement -> Review -> Fix CI ->
Merge -> Report`; a smaller goal might use only `Plan -> Implement`. Lightbulb should provide safe defaults and route
templates, then let users form the route that fits the work.

The product shows one current route per goal, but route changes are not erased. Each edit updates the current route
projection and records an append-only route revision or steering event with the reason, changed stops, and changed
policies when known.

Each stop can combine reusable skill or template references with inline goal-specific instructions. Worker dispatch
resolves those sources into a bounded task packet with handles to the original route, stop, skills, templates, and
artifacts that shaped the packet. This keeps repeatable loop design without forcing fixed single-purpose persona agents.

## Context Continuity Boundary

Lightbulb should keep long-running work continuous through durable loop memory, not by carrying every detail in one
orchestrator context. The continuity spine is the goal, current route, stop history, route revisions, git history, issue
or PR state, artifacts, run reports, and compact worker summaries.

The orchestrator stays responsible for route progress, gates, budgets, risks, and decisions. Workers and sub-agents should
fill their own context windows with the task they were assigned, then return only the minimum summary and artifact handles
needed for the orchestrator to make the next route decision.

The exact context policy remains a stop-level choice. Executable and verification stops should usually delegate into
fresh task-specific worker contexts with isolated worktrees where needed. Tiny steering or UI-only stops may stay in the
current context when the route state is already enough.

The route runner is the durable coordinator for this boundary. It should wake from route events first: stop completion,
worker report arrival, human steering, GitHub or CI events, manual runs, recovery, and schedules. On each wake, it loads
the current route plus compact memory from the database, git, artifacts, issues, pull requests, and worker reports, then
decides the next route action. It persists route events and delegates workers rather than keeping one chat thread alive
for the whole goal.

## Worker Runtime Boundary

Lightbulb should prefer OpenCode-native execution as the default worker runtime because Lightbulb is an OpenCode fork and
already inherits sessions, subagents, task delegation, tools, permissions, skills, plugins, model routing, server APIs,
and durable V2 session events. Flue is not a replacement for OpenCode in stable loop v0; it is a strong source of missing
runtime primitives and an optional adapter target.

The worker-runtime adapter is the replaceable boundary. It accepts a route stop, pickup packet, worker profile, context
bundle, and desired result shape; it returns normalized Lightbulb handles for the worker, runtime run, stream offset,
report, artifacts, and terminal status. OpenCode-native, Codex, local process, Flue-backed, or future in-house execution
can sit behind the same contract.

Adapters do not directly write authoritative route, run, gate, or artifact state. They return normalized runtime events,
reports, statuses, stream offsets, and artifact candidates; the route runner persists those facts into the Lightbulb
graph after applying idempotency, epoch fencing, gates, and human steering rules.

Lightbulb should still adopt Flue and Durable Streams primitives where they improve the OpenCode-native path: append-only
worker/run streams with resumable offsets and explicit closure, idempotent producer writes, epoch fencing,
workflow-style admission, channel and sandbox adapter patterns, observability hooks, eval harness shape, and structured
workflow results. This keeps the stable-v0 design honest: if adding or removing Flue requires rewriting route state,
gates, dashboard projections, or desktop views, the boundary is in the wrong place.

## Schedule Boundary

A schedule is not a loop. A schedule is one trigger source that may wake a loop, alongside manual, webhook, recovery, or
event-driven triggers. The loop owns the policy for what to observe, whether work is due, what candidate or run to admit,
which gates apply, and whether a worker should be dispatched.

This boundary keeps cron from becoming the product model. A disabled, paused, held, or budget-blocked loop can still be
visible and explainable even when its schedule fires and admits no work.

Route progress is event-driven first. A schedule is useful as a heartbeat, discovery cadence, or recovery fallback, but it
should not be required for every route transition. If a worker report or human steering event already makes the next stop
eligible, the route runner can wake immediately instead of waiting for the next scheduled tick.

Route runner wakes coalesce by goal route. Only one route decision should run for a goal route at a time. Concurrent wake
signals should be collected as pending reasons, merged into the next decision, and recorded as consumed so later debugging
can explain which worker reports, CI events, steering inputs, schedules, or recovery signals shaped the transition.
When pending reasons conflict, human steering has precedence over automation. A GitHub, CI, schedule, recovery, or worker
signal may add evidence, but it must not silently override a human route edit or hold. Automation may draft a reroute or
next-action proposal into the inbox; execution waits unless a human explicitly approves it.

## System Discovery Loop

The System Discovery Loop is a read-only loop template. It watches account sources such as GitHub issues, pull requests,
and CI, then creates goal candidates in a human/operator inbox.

It must not silently create real goals, mutate GitHub, launch workers, or start implementation. Its value is safe
discovery and teachable loop structure: observe external state, classify findings, create candidate artifacts, and let a
separate admission decision turn candidates into goals and routes.

## First Example Loop

Use a PR reviewer/merger as the first end-to-end example loop. The discovery side watches repository pull requests and
creates goal candidates for review work. After a user admits one candidate, the route can run one pass or iterate over
events:

1. Pick a pull request.
2. Review the diff and current CI state.
3. Request an external Codex review when configured.
4. Poll review, comment, and CI results.
5. Delegate patches to task-specific workers when issues are found.
6. Push updates and re-check the evidence.
7. Report merge readiness, or go idle until new review comments, CI events, or human steering wake the route runner.

This loop exercises the core primitives without requiring every future policy upfront: discovery, goal candidates, route
admission, stops, workers, gates, artifacts, inbox proposals, event-driven wakes, and durable route memory.

For the first implementation, run only one active PR-review goal per repository. Parallel PR lanes can come later after
the single-lane path proves worktree isolation, review polling, route state, and merge safety.

Keep the first version review-only. It should discover or admit the PR goal, review, request and poll Codex review,
delegate patches, push updates, and report merge readiness. Actual merge stays a manual final action until the gate and
evidence model is proven.

Build the first visual primitives in both the TUI and desktop app. The minimal PR-review goal surface is: PR, current
stop, latest evidence, active worker, blocked reason, and next wake source. Track the TUI and desktop surfaces as separate
implementation issues so the tracer bullet stays reviewable.

Keep the first TUI and desktop surfaces read-only. They should expose route status, evidence, and wake reasons first;
route steering controls, merge actions, and other write operations can follow after the read model is proven.

Split this tracer bullet into four implementation issues before the orchestrator loop picks it up:

- [#65](https://github.com/heyimcarlos/lightbulb/issues/65) PR discovery and goal-candidate read model.
- [#66](https://github.com/heyimcarlos/lightbulb/issues/66) PR-review route runner/read model for one active PR-review goal per repository.
- [#67](https://github.com/heyimcarlos/lightbulb/issues/67) TUI read-only PR-review goal surface.
- [#68](https://github.com/heyimcarlos/lightbulb/issues/68) Desktop read-only PR-review goal surface.

Each issue should be triaged until its scope, acceptance evidence, and blockers are clear. Steering controls and merge
automation are deliberately deferred until these issues are ready for pickup.

Promotion to `ready-for-agent` requires a compact pickup packet, not a full implementation plan. The minimum packet is
scope, non-goals, blockers, affected packages, acceptance evidence, and exact verification commands. Triage should mark
one preferred first verification command before the full evidence path, so a fresh worker can orient quickly. The
orchestrator loop can then pass that packet to a fresh worker and keep parent context focused on route state and outcomes.

## Current Implementation Direction

The current tracer-bullet slices implement steps 3, 4, and the first durable part of step 5:

- `Lightbulb.Service.admitLoopRun(...)` admits one due loop into `lightbulb_run` before worker execution.
- `Lightbulb.Service.admitScheduledLoopRuns(...)` records an account scheduler tick, evaluates all loops, and stores compact
  outcomes for due, skipped, and empty wakeups.
- `lightbulb.loop_run.admitted`, `lightbulb.loop_run.skipped`, and `lightbulb.scheduler_tick.completed` make cron/recovery
  behavior visible even when no worker is spawned.
- `Lightbulb.Service.launchWorker(...)` records a durable `lightbulb_worker_launch_attempt` with run, worker, task packet,
  cwd, worktree, command/environment summary, profile, session/process/log/report handles, held-request reasons, and
  terminal launch failure evidence.
- `lightbulb.worker_launch.running`, `lightbulb.worker_launch.failed`, `lightbulb.worker_launch.already_active`, and
  `lightbulb.worker_launch.skipped` make worker process admission visible without embedding child transcripts.

## Next Slices

1. Real launch adapter: connect durable launch attempts to the actual isolated worktree/session/process spawner and record
   completion/exit transitions.
2. Verifier gate runner: separate test-result artifact registration plus `review`/`gate` transitions from queued run to
   passed/failed/human-required.
3. Budget and kill switch: account/loop budget read model that can pause scheduling when daily caps or repeated failures
   trip.
4. Multi-loop collision guard: one active owner per branch/PR/path group, with skipped events for collisions.
5. Trace-eval loop: periodic analysis over `lightbulb_event`, artifacts, and failed gates that proposes harness-improvement
   issues.

## Sources

- https://www.langchain.com/blog/the-art-of-loop-engineering
- https://addyosmani.com/blog/loop-engineering/
- https://github.com/cobusgreyling/loop-engineering
- https://github.com/Infinite-Labs-AI/infinite-skills/blob/main/skills/goal/SKILL.md
