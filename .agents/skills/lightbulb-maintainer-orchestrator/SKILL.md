---
name: lightbulb-maintainer-orchestrator
description: Coordinate Lightbulb repository maintenance through heartbeat triage, delegated worktrees, proof gates, and owner decision briefs. Use when the user asks to maintain/take lead, wake up periodically, direct work to threads, run repo stewardship, or keep Lightbulb moving autonomously.
---

# Lightbulb Maintainer Orchestrator

Use this as the root control-plane skill for continuous Lightbulb maintenance.

## Quick Start

1. Read root `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/lightbulb/README.md`.
2. Check the real repo boundary:
   ```bash
   git status --short --branch
   gh repo view --json nameWithOwner,url,defaultBranchRef
   gh issue list --state open --limit 50 --json number,title,labels,updatedAt,url
   gh pr list --state open --limit 50 --json number,title,isDraft,reviewDecision,mergeStateStatus,updatedAt,url
   ```
3. Build a compact queue: active worktrees, dirty files, open issues, open PRs, CI failures, unmerged local branches, and Lightbulb loop/run evidence.
4. Classify each item as `Autonomous`, `Needs human`, `Blocked`, `Ready to ship`, or `Ignore only by explicit owner instruction`.

## Heartbeat Mode

When the user asks for periodic maintenance, poll every five minutes in the active session. Do not create hidden background cron jobs unless explicitly asked.

At each heartbeat:

- Re-read `git status --short --branch` and current GitHub issue/PR state.
- Check existing worktrees before starting new work.
- Let coherent active workers continue without interruption.
- Intervene only for explicit blockers, stale completed work, wrong repo/branch, destructive risk, or clear deviation from the task.
- Record meaningful changes and decisions in a compact maintainer note or Lightbulb artifact; do not log routine polling.

## Delegation

Use `lightbulb-delegate` for implementation/research/review lanes that are too broad for the root context.

Use `lightbulb-pr-pipeline` for PR-bound work that should move through maker thread, independent reviewer thread, external review polling, comment fixes, parent merge, and next-slice dispatch.

Every worker prompt must include:

- repo/worktree path and branch
- exact issue/PR or objective
- allowed mutation boundary
- forbidden actions, including no subdelegation
- verification commands
- required evidence shape

Keep one worker lane per repository item. Do not assign two workers to edit the same files.

## Authorization

Treat these as separate permissions:

- triage/read
- local implementation
- commit
- push/open PR
- CI rerun/fix
- merge/close
- release/tag/publish

If permission is missing, stop at the last authorized boundary and report the exact next action needed.

## Proof Gates

Before calling work done:

- verify against the changed user/runtime path, not just types
- run package-local tests; never run tests from repo root
- run `git diff --check`
- inspect final diff
- confirm worktree state
- for public issue/PR updates, include concrete evidence and caveats

For Lightbulb loop work, preserve traceability: a scheduler or worker action should have a durable goal, loop, run, event, gate, or artifact handle when the current system supports it.

## Owner Decision Briefs

Ask the owner only after autonomous work is exhausted. Include:

- canonical GitHub URL or local path
- what changes and why it matters
- proof already completed
- remaining risk or unavailable evidence
- recommended choice
- exact available actions

Do not ask for a vague review, approval, or land/delete choice from an unprepared branch.

## Idle Closeout

An idle lane must become one of:

- next autonomous issue/PR assignment
- decision-ready branch/PR
- verified blocker with exact human action
- clean empty queue plus release/dependency recommendation
