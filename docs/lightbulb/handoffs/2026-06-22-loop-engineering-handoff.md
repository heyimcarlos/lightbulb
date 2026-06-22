---
date: 2026-06-22T07:35:40+00:00
researcher: Hermes Agent
branch: loop-handoff
repository: heyimcarlos/lightbulb
topic: "Lightbulb Loop Engineering Handoff"
tags: [handoff, lightbulb, loop-engineering, agents, orchestration]
status: complete
last_updated: 2026-06-22
type: implementation_handoff
---

# Handoff: Lightbulb loop engineering

## Task status

- **Loop schedulers stopped:** paused the active Lightbulb cron loops and killed the two active `hermes -p coder` loop process groups running from `/home/cyberjanitor/repos/lightbulb`.
- **Functioning loops before pause:** issue orchestrator, discovery triage, review integration, autonomous work status, failure debug, infinite loop supervisor, PR review loop, and traceability evals research loop all had `last_status: ok` before being paused.
- **Handoff scope:** capture the durable product/architecture lessons learned from the loop work, plus local workspace status and PR follow-up points.
- **Pushed current PR work:** PR #56 received an additional commit that compacts the Lightbulb dashboard into a more operator-readable status surface.

## Critical references

- `docs/lightbulb/handoffs/2026-06-22-loop-engineering-handoff.md` — this handoff.
- Brain source of truth: `/home/cyberjanitor/wikis/brain/wiki/projects/lightbulb-loop-aligned-harness.md`.
- Brain source card for Carlos's analogy: `/home/cyberjanitor/wikis/brain/wiki/sources/discord-lightbulb-proactive-steering-google-maps-2026-06-21.md`.
- Active PR from this session: https://github.com/heyimcarlos/lightbulb/pull/56.

## Carlos's analogy / product metaphor

Carlos's analogy was **Google Maps for agent loops**:

- A loop has **one destination**: the user-visible goal/end state.
- The route can contain **many stops**: discovery, plan, worker delegation, implementation, verification, review, debug, merge, cleanup, reporting.
- The system should **reroute around blockers** instead of losing the destination or waiting passively.
- State should be visible enough for the user to understand where the loop is, what the next stop is, and what is blocked.
- User steering should change the route/constraints/stops without discarding the destination.

Operational stack Carlos confirmed:

```text
main agent = supervisor / decision maker
delegate_task = parallel research, review, debugging shards
/goal = long-running single mission until completion
cron = watchdog / recurrence / status
blueprint = reusable automation recipe
kanban = durable multi-worker task graph once decomposition is stable
```

## Core loop-engineering lessons

### 1. Loop engineering is above harness engineering

A single-agent harness is tools + filesystem + validators + prompt/context rules. A loop harness is the recurring system above that: it discovers work, assigns it, isolates worker contexts, checks outputs, records state, and decides the next action.

For Lightbulb, the product is not "repo scan → propose issues". That is one proving loop. The product is a **goal/loop control plane**.

### 2. Context rot is the enemy

The parent/orchestrator should not accumulate all discovery, implementation, logs, reviews, and debugging details. That causes the long-context "dumb zone".

Better pattern:

- Parent keeps destination, route, current stop, budgets, risks, and decisions.
- Child workers get narrow task packets in fresh contexts/worktrees.
- Child workers return structured summaries, changed files, tests, risks, and artifact handles.
- Parent stores durable state outside chat and decides the next route transition.

### 3. Durable state must be outside chat

Do not treat the model conversation as the database. The loop needs durable objects:

- goals
- loops
- stops
- workers
- task packets
- gates
- events
- artifacts
- route decisions
- budgets
- run logs

The local-first default should be SQLite plus append-only event/log artifacts. Postgres/DBOS/Temporal are later scale paths, not the v0 local TUI path.

### 4. Artifacts are work objects, not chat debris

Artifacts should flow both directions:

- into workers as input: specs, plans, logs, diffs, screenshots, repo paths, tickets;
- out of workers as output: files, code patches, reports, PRs, generated assets, verification evidence.

A loop that only produces chat messages is not a proper harness. It needs stable handles and artifact lifecycle.

### 5. Maker/checker split is non-negotiable

A loop that implements and marks itself complete is too easy to fool. Separate roles/passes are needed:

- implementer
- verifier
- reviewer
- failure-debugger
- security/secret checker when needed
- integrator/merger when gates are clean

This maps to the existing running loops: issue orchestrator, PR review loop, failure-debug loop, traceability/evals loop, and review integration loop.

### 6. Run-until-complete autonomy, with real gates

Carlos corrected the boundary: Lightbulb loops should **not stop only to ask before merge** once review/verification gates are clean.

Still hard-stop on:

- failing checks
- dirty mergeability
- unresolved actionable review comments
- unverified local changes
- secrets/credential risk
- production deploys or externally risky side effects

This means the extra human "should I merge?" confirmation is wrong for clean Lightbulb PR loops; verification gates are the approval boundary.

### 7. Blueprints are promoted patterns, not accidental cron jobs

A blueprint should be offered once a loop pattern stabilizes. It should not silently create a recurring scheduler from a candidate artifact.

Blueprint-worthy candidates from this run:

- PR review loop
- failure-debug loop
- traceability/evals loop

Not yet blueprint-worthy:

- Platano SDK loop, because strategy was unstable.

### 8. Thin deterministic harness, fat evolvable skills

Keep the core deterministic:

- state model
- queue/scheduler
- worker isolation
- artifact registry
- event log
- gates
- status/dashboard surface

Put judgment/workflow in skills/playbooks so they can evolve without turning the runtime into opaque prompt soup.

## Active/pushed PRs

### PR #56 — automation blueprint / no-cron delegation

- URL: https://github.com/heyimcarlos/lightbulb/pull/56
- Branch: `automation-blueprint`
- Latest pushed commit from this session: `6cc23048e` — `fix(opencode): compact lightbulb dashboard output`
- Local verification before push:
  - `bun test test/cli/lightbulb.test.ts` from `packages/opencode`: 6 pass / 0 fail.
  - `bun typecheck` from `packages/opencode`: passed.
  - Pre-push root `bun turbo typecheck`: passed under Bun 1.3.14.
- Follow-up: CI had just reset after push; check GitHub Actions before merging.

### PR #55 — repo identity

- URL: https://github.com/heyimcarlos/lightbulb/pull/55
- Branch: `repo-identity`
- Status at handoff: open, GitHub merge state `UNSTABLE` before any action in this session.
- No local changes made in this session.

## Local workspace/worktree state

There are many Lightbulb worktrees left on disk. The important point: **do not blindly PR all of them.** Many are stale, overlapping, or generated by earlier worker loops. Treat them as raw artifacts until reviewed.

### Recently relevant worktrees

- `/home/cyberjanitor/worktrees/lightbulb-blueprints`
  - Branch: `automation-blueprint`
  - PR: #56
  - Status after this handoff should be clean after pushed commit `6cc23048e`.

- `/home/cyberjanitor/worktrees/lightbulb-loop-handoff`
  - Branch: `loop-handoff`
  - Contains this handoff document.
  - Intended PR: docs-only handoff PR.

- `/home/cyberjanitor/worktrees/lightbulb-route-steering`
  - Branch: `route-steering`
  - Dirty, large, mixed scope: route/traceability progress files, route steering schema/migrations, app/browser UI/tool work, message UI updates, and research/design docs.
  - This is not PR-ready as one blob. Split into coherent slices before pushing/opening.

- `/home/cyberjanitor/worktrees/lightbulb-architect`
  - Branch: `architect-spine`
  - Dirty docs/design work: ADR updates, bootstrap spine plan, issue plans, generated design HTML/PNG/MD, `.lightbulb/runs` summaries.
  - Could become a docs/design PR after review, but it has not been verified or de-duplicated against merged docs.

- `/home/cyberjanitor/worktrees/lightbulb-research`
  - Branch: `research-spine`
  - Dirty research artifacts around OpenCode substrate and generated design assets.
  - Useful for product/architecture synthesis; not implementation-ready.

### Other dirty worker worktrees observed

These are worker outputs and should be triaged before any PR:

- `issue-10-worker`: review gate/schema changes.
- `issue-13-worker`: artifact/context/session-runner changes.
- `issue-17-worker`: dispatch module/tests.
- `issue-23-worker`: report plus temporary package data.
- `issue-27-worker`: schedule/budget ledger work.
- `issue-28-worker`: scheduler/doc updates.
- `issue-3-worker`: dashboard CLI work.
- `issue-35-worker`: browser/tool/UI work.
- `issue-4-worker`: artifact ADR/core changes.
- `issue-43-worker`: rebrand inventory docs.
- `issue-44-worker`: binary/package CLI rename work.
- `issue-45-worker`: report-only dirty state.
- `issue-46-worker`: report-only dirty state.
- `issue-47-worker`: broad rebrand/progress/evidence changes.
- `issue-48-worker`: broad rebrand/package changes; local branch matched `origin/dev` commit but had large dirty state.
- `issue-5-worker`: context policy changes.
- `issue-6-worker`: supervisor observability CLI/schema changes.
- `issue-8-worker`: scheduler/dashboard changes.
- `issue-9-worker`: worker packets schema changes.
- `pr-review-loop`: dirty loop progress/status files only.

### Clean but un-PR'd branches observed

These may already be stale/merged/superseded. Do not open PRs until each is compared against `origin/dev` and current open PRs:

- `install-skills`
- `artifact-retention`
- `lightbulb-binary`
- `post-49-verify`
- `dashboard-tracer`
- `lightbulb-delegate`
- `failure-debug`
- `issue-orchestrator`
- `loop-supervisor`
- `post-40-verify`
- `pr-39-review`
- `pr-40-review`
- `pr-50-review`
- `review-integration`
- `schedule-budgets`
- `traceability-loop`

## Suggested next actions

1. Check PR #56 CI and Codex review for commit `6cc23048e`; merge only if clean.
2. Open/merge the docs-only handoff PR so future agents can find this file from the repo.
3. Triage dirty worktrees by slice, not by branch count:
   - docs/design artifacts from `architect-spine` and `research-spine`;
   - route/stop/steer and traceability state from `route-steering`;
   - narrow worker outputs (`issue-17`, `issue-27`, `issue-35`, etc.) only after comparing to merged `origin/dev` and PR #56/#55.
4. Replace ad-hoc cron loops with a first-class loop registry once Lightbulb has durable loop/goal state. The cron layer should become watchdog/recurrence, not the product model.
5. Encode the Google Maps model in the product docs/UI vocabulary: destination, route, stop, steer, reroute, blocker, current next action, and done evidence.

## Verification notes

- Current handoff branch started from `origin/dev` at `c90728b5c`.
- PR #56 pushed successfully after prepending Bun 1.3.14 to `PATH`; the default `bun` on this machine was 1.3.12 and failed the pre-push hook.
- Do not use root tests directly unless the repo guard permits it. Package-level tests used here were run from `packages/opencode`.
