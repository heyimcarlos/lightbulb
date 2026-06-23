---
name: lightbulb-loop-maintainer
description: Maintain Lightbulb loop health by diagnosing Codex goal state, stale runs, worker dispatch, and broken automation without adding cron. Use when a Lightbulb loop, worker lane, PR review lane, or automation setup is broken or stale.
---

# Lightbulb Loop Maintainer

Use this when a Lightbulb loop, worker, PR review lane, or automation setup looks broken.

## Core rule

This is a request-driven maintainer. Do not create a recurring cron job. Use Codex CLI delegation and `lightbulb-delegate` for investigation and fixes; use `/goal` or Kanban only if the work must survive the parent process.

## What to inspect

- Existing scheduler definitions only as data, especially Lightbulb jobs.
- Lightbulb worktrees under `/home/cyberjanitor/worktrees/lightbulb-*`.
- Loop state files under `.lightbulb/loops/*.json`; legacy state under `~/.hermes/state/lightbulb-*` is migration evidence only.
- Installed skill names and qualified names.
- Missing workdirs, stale active runs, failed script paths, bad branch state, repeated prompts/agents/skills.

## Delegation lanes

Use `lightbulb-delegate` for background worker dispatch mechanics and its single background gate. Do not restate or bypass that gate here.

Dispatch non-overlapping lanes through async delegation:

- config lane: inspect Codex/Lightbulb goal, tool, skill, and automation configuration and return exact broken references.
- state lane: inspect loop state files and stale process markers.
- repo lane: inspect Lightbulb worktree status and recent commits.
- fix lane: only after the parent approves a narrow fix or the fix is obviously reversible.

## Safe fixes

Allowed:

- qualify ambiguous skill names such as `agent-skills/engineering/review-and-ship`.
- patch local prompt/skill text to prevent recurring mistakes.
- remove a mistakenly created maintainer cron after verifying it is the wrong abstraction.
- update state/progress artifacts with concise evidence.

Not allowed:

- create a new recurring cron job.
- merge PRs.
- post external comments except when explicitly requested.
- rewrite unrelated worktrees.

## Output

```markdown
## Fixed
- none, or exact fix

## Still blocked
- none, or exact blocker

## Evidence
- `command/file` - what was checked
```
