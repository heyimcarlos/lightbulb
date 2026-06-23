# Stable Loop v0 Triage

Date: 2026-06-22
Repository: `heyimcarlos/lightbulb`
Milestone: [Lightbulb stable loop v0](https://github.com/heyimcarlos/lightbulb/milestone/1)

## Outcome

This triage pass turns the current Lightbulb backlog into a stable-v0 queue for a usable loop-engineering control plane.
It cross-references the current open issue queue with the `cobusgreyling/loop-engineering` ingestion and adds the missing
operational primitives: profile registry, pickup packets, readiness audit, state/budget/run-log exports, candidate inbox,
PR babysitter state, collision guards, safe-write policy, human inbox, profile starters, and trace-eval loop.

No open pull requests existed at triage time.

Issue #2 was closed as completed because linked PR #7 was merged into `dev` with merge commit
`22c2e80cc1c44efb0257d9ca8d1e1b1fd9f00616`.

## New Labels

- `stable-loop-v0`: required for a usable Lightbulb loop-control-plane v0.
- `loop-readiness`: loop profile readiness, audit, budget, run-log, and operating gates.
- `safe-write`: external mutation outbox, connector scopes, denylist, and human-gated writes.
- `human-inbox`: human escalation, decision inbox, and operator digest surfaces.

## New Epic

- [#72](https://github.com/heyimcarlos/lightbulb/issues/72) `feat(lightbulb): stabilize loop engineering control plane v0`

## New Cobus-Derived Issues

| Issue | Purpose | Main Dependencies |
| --- | --- | --- |
| [#73](https://github.com/heyimcarlos/lightbulb/issues/73) | Loop profile registry and readiness metadata | None |
| [#74](https://github.com/heyimcarlos/lightbulb/issues/74) | Structured `ready-for-agent` pickup packets | #9, #12 |
| [#75](https://github.com/heyimcarlos/lightbulb/issues/75) | Loop state, budget, and run-log exports | #27, #33 |
| [#76](https://github.com/heyimcarlos/lightbulb/issues/76) | Native Lightbulb loop readiness audit | #73, #75 |
| [#77](https://github.com/heyimcarlos/lightbulb/issues/77) | System Discovery candidate inbox | #12, closed #65 |
| [#78](https://github.com/heyimcarlos/lightbulb/issues/78) | PR Babysitter route state digest | closed #66 |
| [#79](https://github.com/heyimcarlos/lightbulb/issues/79) | Multi-loop ownership and collision guards | #17, #22, #26 |
| [#80](https://github.com/heyimcarlos/lightbulb/issues/80) | Safe-write connector policy gates | #10, #38, #52 |
| [#81](https://github.com/heyimcarlos/lightbulb/issues/81) | Human inbox and escalation digest | #33, #52 |
| [#82](https://github.com/heyimcarlos/lightbulb/issues/82) | Loop profile starters and bootstrap | #73, #74, #75 |
| [#83](https://github.com/heyimcarlos/lightbulb/issues/83) | Trace-eval failure mode loop | #76, #81 |

Every new implementation issue includes a structured `## Pickup packet` section.

## Current Open Issue Cross-Reference

| Issue | Triage Result |
| --- | --- |
| [#1](https://github.com/heyimcarlos/lightbulb/issues/1) | Kept as the parent PRD. Commented with the stable-v0 direction and links to #72-#83. |
| [#6](https://github.com/heyimcarlos/lightbulb/issues/6) | Existing supervisor/observability slice. Added stable-v0 milestone and expansion toward #33, #75, #76, #81. |
| [#9](https://github.com/heyimcarlos/lightbulb/issues/9) | Existing task-packet substrate. Added expansion comment pointing to #74 for first-class pickup packets. |
| [#10](https://github.com/heyimcarlos/lightbulb/issues/10) | Existing review/integration gate slice. Added expansion for maker/checker verifier stance and safe-write gates. |
| [#12](https://github.com/heyimcarlos/lightbulb/issues/12) | Existing GitHub issue intake slice. Added expansion toward Cobus-style issue triage/candidate inbox in #77. |
| [#14](https://github.com/heyimcarlos/lightbulb/issues/14) | Existing crash-safe recovery slice. Added expansion toward run-log export and human inbox escalation. |
| [#17](https://github.com/heyimcarlos/lightbulb/issues/17) | Existing dispatch slice. Added expansion to consume pickup packets and check collision guards. |
| [#18](https://github.com/heyimcarlos/lightbulb/issues/18) | Existing final-report ingestion slice. Added expansion for verifier evidence and run-log export fields. |
| [#22](https://github.com/heyimcarlos/lightbulb/issues/22) | Existing launch adapter slice. Added expansion for worktree isolation and ownership handles. |
| [#26](https://github.com/heyimcarlos/lightbulb/issues/26) | Existing runner tick slice. Added expansion for cheap early exit, budget checks, and readiness signals. |
| [#27](https://github.com/heyimcarlos/lightbulb/issues/27) | Existing budget ledger rollup. Added expansion pointing to #75 for budget/run-log exports. |
| [#29](https://github.com/heyimcarlos/lightbulb/issues/29) | Existing dependency reconciliation slice. Added expansion as defense against state rot. |
| [#33](https://github.com/heyimcarlos/lightbulb/issues/33) | Existing operations snapshot slice. Added expansion for `STATE.md`-style state, human inbox, run log, readiness, and budget. |
| [#38](https://github.com/heyimcarlos/lightbulb/issues/38) | Existing mutation outbox. Added expansion as the propose-only half of safe-write. |
| [#52](https://github.com/heyimcarlos/lightbulb/issues/52) | Existing mutation apply pass. Added expansion as the human-gated apply half of safe-write. |
| [#67](https://github.com/heyimcarlos/lightbulb/issues/67) | Existing TUI read-only PR-review surface. Added expansion to consume #78 PR Babysitter state digest. |
| [#68](https://github.com/heyimcarlos/lightbulb/issues/68) | Existing desktop read-only PR-review surface. Added expansion to consume #78 PR Babysitter state digest. |

## Recommended Execution Order

1. Finish and integrate the `agent-done` foundation: #6, #9, #10, #17, #27.
2. Finish the blocked runtime chain: #12, #18, #22, #26, #14, #29, #33, #38, #52.
3. Land new stable-v0 primitives with no active blockers: #73 and #78.
4. Land pickup/state/readiness primitives: #74, #75, #76, #77.
5. Land safety and coordination: #79, #80, #81.
6. Land profile starters and trace-eval: #82, #83.
7. Land read-only operator surfaces after the state digest is in place: #67, #68.

## Stable v0 Definition

Lightbulb is stable enough to use when:

- It has loop profiles with explicit cadence, risk, phases/stops, skills, human gates, budget, and early-exit policy.
- Every `ready-for-agent` issue can produce a structured pickup packet for a fresh worker context.
- The route runner can dispatch, launch, recover, ingest final reports, and expose compact state without raw transcripts.
- The operator can inspect state, budget, run log, active workers, holds, next wakes, and human inbox in one place.
- External writes go through safe-write outbox/apply gates with connector capability profiles and human approval.
- Multi-loop collisions are held rather than guessed through.
- Read-only TUI and desktop views show PR-review route status from durable state.
- A readiness audit can explain why a loop is L0/L1/L2/L3 and what is missing.
