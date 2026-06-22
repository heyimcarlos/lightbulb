---
name: lightbulb-loop-maintainer
description: Maintain Lightbulb automation loops through Hermes async delegation, not a recurring cron job.
---

# Lightbulb Loop Maintainer

Use this when a Lightbulb loop, worker, PR review lane, or automation setup looks broken.

## Core rule

This is a request-driven maintainer. Do not create a recurring cron job. Use Hermes async delegation for investigation and fixes; use `/goal` or Kanban only if the work must survive the parent process.

## What to inspect

- Hermes cron job definitions only as data, especially Lightbulb jobs.
- Lightbulb worktrees under `/home/cyberjanitor/worktrees/lightbulb-*`.
- Loop state files under `.lightbulb/loops/*.json` and `~/.hermes/state/lightbulb-*`.
- Installed skill names and qualified names.
- Missing workdirs, stale active runs, failed script paths, bad branch state, duplicate prompts/agents/skills.

## Delegation lanes

Before dispatching background lanes, verify the Lightbulb/OpenCode process has enabled background subagents:

```bash
test "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-${OPENCODE_EXPERIMENTAL:-}}" = "true"
```

If the check fails, enable `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` for the process before using `background: true`, or run the lane in the foreground without `background: true`.

Dispatch non-overlapping lanes through async delegation:

- config lane: inspect Hermes job/tool/skill configuration and return exact broken references.
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
