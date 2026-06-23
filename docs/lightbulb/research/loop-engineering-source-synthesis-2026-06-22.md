# Loop Engineering Source Synthesis

Date: 2026-06-22
Purpose: extract the local and external loop-engineering literature before finalizing Lightbulb's product/domain model.

## Evidence Map

Local Lightbulb sources:

- `docs/lightbulb/handoffs/2026-06-22-loop-engineering-handoff.md`
  - Captures the "Google Maps for agent loops" metaphor.
  - Names destination, stops, rerouting, visible state, and steering as the product language.
  - Records the observed loop stack: supervisor, delegated workers, `/goal`, cron, blueprint, and kanban.
- `docs/lightbulb/loop-engineering.md`
  - Separates agent loop, verification loop, event-driven loop, and hill-climbing loop.
  - Defines the target durable spine: goal contract, schedule wakeup, run ledger, worker dispatch, maker/checker split, artifacts, budgets, human inbox, and trace-eval loop.
  - States that the current implementation has only tracer bullets for scheduler ticks, run admission, and launch-attempt evidence.
- `docs/lightbulb/README.md`
  - Defines Lightbulb as an account-level orchestration harness over the OpenCode execution/session substrate.
  - Lists goals, loops, workers, task packets, gates, and artifacts as the work graph.
- `docs/lightbulb/adr/0001-fork-opencode.md`
  - Keeps OpenCode as execution/session shell, with Lightbulb's account-level model isolated beside it.
- `docs/lightbulb/adr/0005-durable-goal-lifecycle.md`
  - Says an OpenCode session may contribute to a goal, but is not the goal.
- `docs/lightbulb/adr/0005-decision-artifact-routing.md`
  - Treats durable product and architecture decisions as artifact-backed gates before dispatch.

External sources:

- Cobus Greyling loop-engineering repo: https://github.com/cobusgreyling/loop-engineering
- Cobus Greyling primitives doc: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/primitives.md
- Cobus Greyling loop design checklist: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/loop-design-checklist.md
- Cobus Greyling operating loops doc: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/operating-loops.md
- Cobus Greyling failure modes: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/failure-modes.md
- Cobus Greyling anti-patterns: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/anti-patterns.md
- Cobus Greyling safety guide: https://raw.githubusercontent.com/cobusgreyling/loop-engineering/main/docs/safety.md
- LangChain, "The Art of Loop Engineering": https://www.langchain.com/blog/the-art-of-loop-engineering
- Addy Osmani, "Loop Engineering": https://addyosmani.com/blog/loop-engineering/
- Cobus Greyling Medium essay: https://cobusgreyling.medium.com/loop-engineering-62926dd6991c

## Source-by-Source Extraction

### Lightbulb handoff

The handoff's strongest product contribution is the route metaphor. A loop has one destination, many stops, visible state, and route changes that do not discard the destination. It also records a working operational stack: a supervisor decides, child workers explore or implement, `/goal` represents run-until-complete work, cron/watchdogs provide recurrence, blueprints package stable patterns, and kanban/task graphs become useful once decomposition is stable.

The handoff also warns against context rot. The parent should retain destination, route, current stop, budgets, risks, and decisions. Children receive narrow task packets and return summaries plus artifact handles. Durable state must live outside chat.

### Local loop-engineering doc

The local architecture already matches the literature's layered model. It names four loop layers:

- agent loop: one worker doing bounded model/tool work
- verification loop: tests, review, graders, and retry feedback
- event-driven loop: cron, webhook, manual, or recovery trigger
- hill-climbing loop: analysis over traces/artifacts to improve the harness itself

The current code is not yet the full product. It has durable scheduler tick/run-admission/launch-attempt evidence, but real worker lifecycle, verifier gates, budget/kill switches, collision control, and trace-eval loops remain next slices.

### Addy Osmani

Addy frames loop engineering as the layer above agent harness engineering. The harness equips one agent run; the loop finds work, hands it out, checks it, records state, and decides the next action.

His six-part capability model is directly relevant to Lightbulb:

- automations for cadence and discovery
- worktrees for safe parallel execution
- skills for persistent project knowledge
- plugins/connectors for real tools
- sub-agents for ideation and verification
- state outside the conversation

The concrete loop shape in the article is: scheduled triage reads CI/issues/commits, writes findings to state, opens isolated worktrees for actionable work, sends one worker to draft and another to review, uses connectors for PR/ticket mutation, and sends unhandled items to an inbox.

### LangChain

LangChain's useful contribution is loop layering rather than product UI. It describes:

- agent loop: model and tools repeat until task completion
- verification loop: output is graded and retried with feedback
- event-driven loop: schedule/webhook/channel triggers background work
- hill-climbing loop: traces are analyzed to improve prompts, tools, graders, memory, and other harness configuration

The human oversight section matters for Lightbulb: humans are not removed. Oversight becomes explicit touch points around sensitive tool calls, grading, final outputs, and harness improvements.

### Cobus Greyling repo and Medium essay

Cobus turns the concept into operations material. The repo adds readiness levels, pattern starters, audit/cost tools, run logs, budget docs, failure modes, and safety guidance.

The repeated operational lessons are:

- start L1/report-only before L2 assisted or L3 unattended behavior
- use state/run logs so loops can explain what happened
- spawn expensive sub-agents only after cheap triage finds actionable work
- define budgets, max attempts, pause criteria, and kill switches
- separate implementer and verifier
- isolate work in worktrees and clean them up
- minimize connector permissions early
- treat auto-merge as exceptional and policy-controlled

The failure-mode catalog is especially aligned with Lightbulb's current pain: infinite fix loops, state rot, verifier theater, notification fatigue, token burn, over-reach, comprehension debt, parallel collisions, and escalation failures are exactly what Lightbulb should make visible.

## Adoption Map for Lightbulb

### Adopt

- Product root is a durable goal/destination, not a chat session.
- A route belongs to the goal and has ordered stops/checkpoints.
- Steering updates route, constraints, priority, or next stop without losing the goal.
- Loops are durable engines/policies that advance or monitor goals.
- Scheduler/event triggers are loop inputs, not the product model.
- Workspaces/worktrees and sessions are execution substrate owned by runs/workers.
- Maker/checker split is required before autonomous completion claims.
- Artifacts are first-class work objects with lineage and gate relationships.
- Run logs, budgets, attempts, and kill switches are product primitives, not optional docs.
- Trace/hill-climbing loops should improve prompts, tools, skills, gates, and blueprints from real run evidence.

### Adapt

- `STATE.md` becomes SQLite plus artifact handles in Lightbulb, with optional markdown/HTML exports for human review.
- Report-only/L1, assisted/L2, and unattended/L3 should become explicit loop readiness levels in the product.
- Auto-merge should be represented as a loop policy with path/risk allowlists and visible gates. The default can stay conservative, while a trusted PR loop may merge after all configured gates are clean.
- Skills become Lightbulb blueprint ingredients: project knowledge, role instructions, output contracts, and verification rituals.
- Connector least-privilege becomes a visible capability profile per loop, not hidden token setup.

### Defer

- Cloud-scale orchestration, distributed locking, and Temporal/DBOS-style execution.
- RL/fine-tuning style hill-climbing.
- Fully unattended L3 behavior for code-editing loops until Lightbulb can show run logs, budgets, gates, artifact evidence, collision guards, and clear human escalation.
- Kanban-style multi-worker task graphs until the single-goal route model is stable.

### Avoid

- Treating an OpenCode session as the loop.
- Treating cron as the loop model.
- Letting the same worker both implement and declare success.
- Shared unstructured state across several loops.
- Expensive sub-agent chains on every wakeup.
- Auto-merge without an explicit policy, risk classification, and audit trail.
- Desktop UI that starts with "new session" while hiding the goal/route/stop state that users actually need.

## Implications for the Desktop Entry Point

The inherited OpenCode flow is:

1. Open project.
2. Create or resume session.
3. Optionally create workspace/worktree.
4. Prompt the agent.

The source-grounded Lightbulb flow should be:

1. Open project or account.
2. Create or resume a goal.
3. Define destination, done evidence, scope, constraints, risk policy, and initial route.
4. Attach or create loops: triage, implementation, verification, PR review, failure debug, status, trace-eval.
5. Let Lightbulb create runs, workers, worktrees, and sessions as execution artifacts.
6. Show current stop, next stop, blockers, active workers, gates, artifacts, budgets, and reroute options.

This keeps OpenCode's session/workspace substrate, but it stops presenting sessions as the main product object. A session is a transcript. A workspace is an isolated filesystem. A loop is a policy/engine. The user should mostly see the goal route and its living state.

## Candidate Domain Model

Provisional, not accepted:

- Goal: durable destination with outcome, done evidence, scope, constraints, risk policy, and lifecycle status.
- Route: current ordered plan for reaching the goal.
- Stop: a checkpoint on a route, such as research, plan, implement, verify, review, merge, or report.
- Steering: a user or system decision that changes the route, stop order, constraints, loop policy, or blocked/unblocked state while preserving the goal.
- Loop: recurring or run-until-done policy/engine that observes state and proposes or performs next actions toward goals.
- Run: one admitted execution attempt from a loop trigger.
- Worker: one isolated agent/process/session assigned a bounded task packet.
- Workspace: execution isolation, usually a git worktree.
- Session: conversation/tool transcript for a worker or operator interaction.
- Gate: explicit approval, verification, budget, risk, or human decision point.
- Artifact: durable input/output handle with lineage.
- Blueprint: reusable loop recipe promoted only after a pattern proves stable.

## Unanswered Grilling Questions

1. Is every user-visible Lightbulb object rooted in a goal, or can there be account-level loops that discover goals before a goal exists?
2. Is a "loop" a reusable blueprint/policy, a running controller instance, or both with separate names?
3. Does a workspace belong to one goal, one stop, one worker, or a project-level pool reused across runs?
4. Can one goal have multiple active routes, or exactly one current route plus archived/superseded route decisions?
5. What is the default first screen: account goal map, project goal list, or current route view?
6. Which loops are allowed to mutate GitHub or merge PRs without asking, and how is that policy shown to the user?
7. What is the minimum viable visible loop state for desktop: destination, route, current stop, active workers, gates, artifacts, budget, and recent events?
8. Do browser/computer-use artifacts attach to sessions directly, or must they always flow through a Lightbulb run/artifact handle?
9. Is "Google Maps for agent loops" primarily navigation over work state, or also an active route optimizer that chooses the next worker/loop?
10. What must be trimmed from inherited OpenCode UI so the user is not forced through session-first mental models?

## Working Thesis for the Next Conversation

Lightbulb should be a goal-route control plane over OpenCode's project/session/workspace substrate. The product object is the goal destination. The core operational object is the loop that admits runs and advances stops. The core UI object is the route view: where the work is, why it is there, what is blocked, what workers are active, what evidence exists, and what steering choices are available.

This thesis is intentionally provisional. It should not be committed to `CONTEXT.md` until the glossary terms are accepted in a grilling session.
