# Lightbulb Harness Domain

Lightbulb is an account-level orchestration harness built on an OpenCode fork. It manages long-running agent work across goals, loops, workers, schedules, tasks, gates, and artifacts.

## Product thesis

OpenCode is the execution/session substrate. Lightbulb owns the account-level work graph:

- **Goals**: durable objectives that may span repositories, schedules, and workers.
- **Loops**: recurring discovery/execution/verification policies.
- **Workers**: isolated OpenCode-native agent sessions or local processes, usually fresh-context delegated runs.
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

## Durable Worker Launch Attempts

Worker dispatch records a `lightbulb_worker_launch_attempt` row before treating a child process or session as active.
Launch attempts are tied to the account, run, worker, and task packet, and carry compact process handles: cwd,
worktree ID, command summary, environment summary, profile ID, session ID, process ID, heartbeat URI, log URI,
expected final-report URI, and failure reason.

An active-key guard allows only one active launch attempt per task packet. Retrying the same request returns the active
attempt and records `lightbulb.worker_launch.already_active` instead of starting duplicate worker ownership. Failed or
blocked launches are terminal evidence with no active key, so later recovery can decide whether to issue a new packet.

Dependency, human-review, budget, and context-policy holds are recorded as skipped launch events with exact bounded
reasons before any child process starts. Parent summaries and dashboard worker rows expose launch attempts as handles
that point to heartbeat, log, and final-report artifacts; raw child transcripts stay outside parent read models.

## Review And Integration Gates

Review gates are the maker/checker boundary for worker output. They target a run, worker, or artifact and record the
owner, optional reviewer, reason, opened time, and decision time in the gate metadata. The review-specific statuses are
`opened`, `approved`, `rejected`, and `needs-rework`; they map onto the existing durable gate statuses
`pending`, `passed`, `failed`, and `blocked` so older dashboards and retention rules continue to work.

Review gates differ from dependency waits and context/budget holds. Dependency waits prevent work from being picked up
because prerequisite issue state is not integrated yet. Context and budget holds stop or checkpoint execution before a
worker consumes more resources. Review gates happen after output exists: they decide whether a parent can treat that
output as integrated account state. A `needs-rework` review gate remains visible in the dashboard inbox as a blocked
human-review item, while an approved gate leaves the inbox and records `review_status=approved`.

## Worker Final Reports

Worker final-report ingestion is the boundary where Lightbulb accepts child output as durable control-plane state. The
input names the run, worker, task packet, terminal status, summary, report artifact handles, verification evidence, and
usage totals. Raw child transcripts are rejected; parents store compact summaries and artifact handles only.

Report ingestion updates the worker, task packet, run, launch attempt, artifact lineage, usage metadata, and append-only
event evidence in one operator-visible path. Completed reports mark the run passed and approved. Failed and blocked
reports preserve exact terminal reasons. Reports that need parent review complete the worker output but open a review
gate against the report artifact so dashboard and parent summaries show the human-held integration state separately from
dependency or budget holds.

## Budget Usage Ledger

Budget usage is stored as compact ledger rows, not raw transcripts. A usage row names the account, goal, loop, run,
optional worker, source issue or artifact handle, idempotency key, cost units, token units, context units, approval
count, and usage time. Worker final-report ingestion records usage through the same seam, so a retry with the same report
handle updates report state without double-counting budget consumption.

Loop budget read models roll the current UTC day into used, remaining, exhausted, and unknown states. Run counts,
tokens, cost units, context units, and optional approval counts all produce bounded scheduler reasons such as
`daily_run_budget_exhausted`, `token_budget_exhausted`, `cost_budget_exhausted`, `context_budget_exhausted`, and
`approval_budget_exhausted`. Loops without profile budget metadata report `budget_profile_missing` instead of guessing.
Schedulers and supervisor snapshots consume these compact reasons to hold work before launching more workers.

## Operator Exports

Operator exports are compact read models over the durable Lightbulb graph. They mirror the useful parts of
`STATE.md`, `loop-budget.md`, and JSONL-style run logs without making generated files authoritative. SQLite, event rows,
artifacts, gates, budget usage, and dashboard projections remain the source of truth.

Use the CLI to read the current export:

```bash
lightbulb operator-export --account <lbacc_...>
lightbulb operator-export --account <lbacc_...> --section state
lightbulb operator-export --account <lbacc_...> --section budget
lightbulb operator-export --account <lbacc_...> --section run-log
```

The state export groups high-priority/active work, watch items, human inbox work, recent noise/ignored items, and
resolved/recent items. The budget export includes per-loop limits, used and remaining daily units, exhausted/unknown
reasons, account kill-switch status, and an explicit not-configured worker-spawn budget dimension until that policy
exists. The run-log export emits one compact entry per run with profile, duration, found items, actions, escalations,
usage estimates, and report/artifact/gate handles. None of the sections include raw worker transcripts, full issue
histories, or credentials.

## Worker Runtime Adapter Contract

OpenCode-native execution is the default Lightbulb worker runtime for stable loop v0. Lightbulb is an OpenCode fork and
should use OpenCode sessions, agents, subagents, task delegation, skills, tools, plugins, permissions, server/SDK,
durable V2 sessions, and event sequencing before replacing that substrate.

The worker-runtime adapter remains replaceable. OpenCode-native execution, Codex, local processes, optional Flue, or a
future in-house runtime must fit behind the same contract. Runtime adapters do not receive a database handle and do not
write authoritative Lightbulb goal, route, run, gate, report, or artifact state. They return normalized launch/status
facts, append-only runtime events, resumable stream offsets, explicit closure state, report candidates, artifact
candidates, and opaque runtime-native handles. The Lightbulb route runner persists those facts after idempotency checks,
epoch fencing, gates, and human steering.

Durable Streams semantics should be implemented Lightbulb-native first, shaped like the Durable Streams protocol:
append-only events, monotonic offsets, idempotent producer keys, explicit closure, channels, sandbox metadata,
observability handles, eval markers, and structured workflow results. Importing a Durable Streams package should remain a
later optimization only if the native contract proves insufficient.

Flue is not the default runtime and is not the Lightbulb product model. It is useful as an optional future adapter and as
a comparable for workflow admission, durable streams, channels, sandboxes, observability, and evals. Any Flue-backed
spike must remain behind the same adapter boundary and must not become authoritative for Lightbulb control-plane state.

## Adversarial PR Review Gate

Lightbulb does not rely on paid Codex, Copilot, or model API reviewer credits for its baseline PR gate. The deterministic
adversarial reviewer runs from the trusted base branch, fetches the PR head only as a diff target, and comments with
bounded blockers, warnings, passed checks, and a merge recommendation. This follows the loop-engineering dogfood shape:
make a local audit script the source of truth, run it in CI, and post compact feedback instead of raw transcripts.

The gate should fail only on high-confidence hazards: user-facing app/desktop/TUI/CLI changes without visual evidence,
hidden cron or scheduled automation, broad workflow write permissions, pull-request-target workflows that execute PR-head
code, raw transcript-shaped artifacts, or oversized single-file additions. Lower-confidence concerns such as missing test
updates, missing package-local verification text, workflow changes, or large-but-not-huge additions should stay warnings
so useful PRs are not blocked by noisy heuristics.

Run the reviewer locally with `bun run script/adversarial-review.ts --base origin/dev --head HEAD`. CI runs the same
script from `.github/workflows/adversarial-review.yml` and uploads both JSON and Markdown artifacts for parent loop
review. For UI, desktop, browser, or CLI-affecting PRs, the PR body should include screenshot, recording, terminal
evidence, or an explicit not-applicable rationale.

## PR Babysitter Digest

PR review routes expose a compact operator digest grouped into watched, escalated, and recent items. The digest is a
read model over PR review route rows and route wakes; it does not mutate GitHub and does not become authoritative route
state. Each item carries the bounded PR status, current stop, attempt count, latest compact evidence, active worker
handle, human decision, next wake source, and escalation reasons. Terminal routes stay in the recent bucket only inside
the read-model retention window, giving operators short-lived trust evidence without reopening raw review histories.

## Desktop Browser QA

Desktop/browser PRs can produce local visual evidence with:

```bash
cd packages/desktop
bun run qa:browser -- --out ../../.lightbulb/evidence/desktop-browser-qa
```

The command makes Electron's binary install deterministic, builds the desktop assets with the app memory router starting
on `/browser`, launches an isolated read-only QA profile, captures `browser-surface.png`, writes `browser-surface.json`,
and exits. It uses `OPENCODE_DESKTOP_QA=1`, an in-memory database, a temporary user-data root, and
`OPENCODE_DESKTOP_REMOTE_DEBUGGING_PORT=off` so it can run next to a normal desktop dev session without stealing the
default single-instance lock or DevTools port.

Stable-v0 desktop surfaces can point the same harness at a seeded Lightbulb database:

```bash
OPENCODE_DB=/tmp/lightbulb-stable.db ./packages/opencode/bin/lightbulb dashboard --seed --format json
cd packages/desktop
OPENCODE_DB=/tmp/lightbulb-stable.db \
  OPENCODE_DESKTOP_QA_ROUTE=/lightbulb/dashboard \
  OPENCODE_DESKTOP_QA_SELECTOR="[data-page='lightbulb-dashboard']" \
  bun run qa:browser -- --out ../../.lightbulb/evidence/desktop-stable-dashboard-qa
```

When `OPENCODE_DB` is omitted the QA harness still uses an isolated in-memory database. When it is provided, the desktop
sidecar preserves it so the captured route can render real seeded goal, route, run, worker, artifact, and gate state.

Use `OPENCODE_DESKTOP_QA_ROUTE=/lightbulb/pr-review` to capture the Lightbulb route monitor. The harness waits for the
route's own `data-page` marker and writes `lightbulb-pr-review.png` plus `lightbulb-pr-review.json`. For new visual
routes, use a stable `data-page` marker that matches the route slug, or set `OPENCODE_DESKTOP_QA_SELECTOR` explicitly.

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

## Issue Queue Intake

Issue intake is the fakeable read-model seam before structured pickup packets and account runner ticks. It ingests compact
GitHub-like snapshots: issue number, title, URL, labels, body handle or summary, update time, and dependency refs. It does
not call GitHub directly in core tests and does not copy full issue bodies or comment transcripts into parent context.

The intake classifier maps repo triage labels into bounded statuses: `ready`, `dependency_blocked`, `human_held`,
`active_worker_owned`, `integrated_done`, or `not_ready`. Only `ready-for-agent` issues without dependency, human, active
worker, or integrated labels become routing inputs. Dependency-blocked issues are skipped with exact blocker refs and
produce no worker-spawn request.

Ready issues become compact task-packet requests and `IssueRoutingInput` values with issue, prompt, instruction, and body
handles. The runner tick can then create a durable task packet from handles such as `github:issue:12:prompt` and
`github:issue:12:body`, leaving full issue/comment content outside the authoritative Lightbulb route/run/gate/artifact
state.

## Dependency Unblock Reconciliation

Dependency reconciliation is the fakeable read-model seam between issue intake and worker pickup. It accepts compact
issue snapshots plus explicit evidence handles for closed dependencies, integrated issues, accepted review gates, or
base-branch proof. It never rereads full issue histories, calls GitHub, or launches workers in core tests.

When all dependency refs are satisfied, reconciliation proposes a bounded mutation that removes only the dependency hold,
sets the blocked reason to `None - dependency satisfied by <evidence>.`, emits one idempotent reconciliation event, and
returns an operator summary with compact issue, gate, or git handles. Mixed holds keep their human, budget, context, or
ADR labels and remain out of worker dispatch until those separate holds clear. Missing or pending evidence leaves the
issue dependency-held with an exact skipped reason.

## Issue Mutation Outbox

The issue mutation outbox is the outbound companion to issue intake (#12). Intake reads compact GitHub-like snapshots and
turns ready issues into local work handles; the outbox stores compact proposed GitHub mutations that a parent or future
apply pass can inspect without reopening planner reports, worker transcripts, or full issue histories.

Outbox proposals cover issue creation, title/body edits, label additions and removals, and comments. Each proposal records
the source account plus optional goal, loop, run, artifact, and planner handles; the target issue when one exists; desired
labels or state; a deterministic idempotency key; a bounded apply summary; and the exact renderable mutation. Re-emitting
the same proposal returns the existing item and does not duplicate outbox rows or proposal events.

The outbox holds unsafe or ambiguous proposals instead of treating them as apply-ready. Missing create title/body fields,
conflicting state and triage-label requests, unsafe removals of human/budget/context/review labels, and stale snapshot
preconditions are recorded as bounded hold reasons. Dependency reconciliation (#29) may produce mutation-shaped requests
for dependency-only releases, but it remains the evidence/read-model seam; the outbox is where those requests become
durable parent-applicable proposals. Operations snapshots (#33) summarize account health and may later count or link
outbox handles, but snapshots are read models and do not apply or author GitHub mutations.

The v0 outbox has only a fake apply-result seam. It can mark proposals `applied`, `skipped`, `failed`, or `superseded`
with compact result, issue URL, or error handles while preserving source evidence. Live GitHub writes, operator approval,
adapter capability checks, dry-run grouping, and retry policy belong to the future operator-approved apply pass (#52).

## Pickup Packets

Pickup packets are the structured worker handoff contract layered on top of task packets. A packet records the work
source, scope, non-goals, blockers, affected packages/paths, preferred first command, full verification commands,
acceptance evidence, route stop, risk notes, context handles, artifact handles, skills/templates, and attempt/escalation
policy. The JSON-backed `## Pickup packet` Markdown section is stable for issue bodies or comments: re-parsing and
re-rendering replaces the existing section instead of duplicating it.

Issue intake and decision routing carry pickup packets as compact data. The account runner stores the packet in worker
and task-packet metadata, and writes worker-facing instructions derived from the packet into `lightbulb_task_packet`.
Raw issue bodies, comments, logs, and worker transcripts remain outside the durable Lightbulb route/run/gate/artifact
state unless a later explicit artifact handle points to them.

## Account Loop Runner Ticks

The account loop runner tick is the first deterministic coordinator above issue/work intake, scheduler supervision, and
worker launch. It accepts an account, current time, stable tick ID, compact issue routing inputs, and a fakeable storage
seam. It does not run a model or child process itself. It selects one ready work item, asks the scheduler supervisor to
admit at most one due loop run, creates or reuses one worker plus task packet for that run, records a durable worker
launch request, and writes a compact `lightbulb.account_loop_runner_tick.completed` journal event.

Runner ticks check cheap work holds before any run admission: dependency-blocked issues return `dependency_held`,
human-held issues return `human_review_held`, and context-policy-held issues return `context_policy_held`. If no ready
work remains, the tick records `no_ready_work` and creates no run. If ready work exists but the scheduler cannot admit a
loop, the tick preserves bounded supervisor reasons such as `budget_held`, `disabled`, `no_due_loops`,
`already_active_run`, `stale_worker`, or `recovery_required`.

When a loop is selected, the runner stores the scheduler tick ID in the run admission source, the worker metadata, and
the task packet metadata. Retrying the same tick ID reuses the existing supervisor pass, run, worker, task packet, and
active launch attempt; it reports `already_active` instead of duplicating worker ownership. Launch failures and pre-launch
blocks are terminal bounded tick outcomes (`launch_failed` or `blocked`) that leave recovery/report-ingestion loops with
explicit handles to inspect later.

This coordinator sits before final-report ingestion and after issue intake. Report ingestion remains responsible for
turning completed worker reports into run status, artifact lineage, review gates, and budget usage evidence. Crash
recovery should resume from the runner tick journal, scheduler pass, worker launch attempt, heartbeat/log handles, and
expected report URI rather than raw worker transcripts.

## Operations Snapshot Feed

The operations snapshot feed is the compact operator read model above scheduler ticks, worker launch attempts, discovery
inbox rows, gates, artifacts, and dependency reconciliation evidence. A snapshot refresh reads the account graph and
recent scheduler tick events, computes bounded counts plus compact handles, and upserts one durable
`lightbulb_operations_snapshot` row per account/snapshot key.

Scheduler ticks remain the journal of one wakeup. The operations snapshot is the current account-level view: ready work,
active ownership, no-op/skipped loops, pending review gates, budget holds, stale worker holds, recovery-required holds,
dependency releases, next wake, and recent report/artifact handles. It stores source hashes so re-running the same
snapshot against unchanged state returns the existing row without duplicating events. It does not embed raw worker
transcripts, full issue histories, or report bodies.

The seeded dashboard tracer demonstrates one visible dogfood route. The operations snapshot is the feed that future TUI,
desktop, human inbox, `STATE.md`-style exports, and run-log/status views should consume when they need the current
control-plane state rather than a single tracer graph.
