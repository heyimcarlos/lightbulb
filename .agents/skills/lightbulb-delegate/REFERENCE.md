# Lightbulb Delegate Reference

This reference is for writing concrete worker prompts after `SKILL.md` has already selected delegation.

## Background Worker Shape

Use the real `task` tool with `background: true` for immediate request-driven automation after the background gate in `SKILL.md` passes.

```json
{
  "description": "Locate the files involved in the requested Lightbulb slice",
  "prompt": "Repo: /home/cyberjanitor/worktrees/lightbulb-slice. Return file:line evidence only. Do not edit files.",
  "subagent_type": "lightbulb-locator",
  "background": true
}
```

Dispatch additional independent lanes with separate `task` calls only when their file scopes do not overlap. Current Lightbulb background subagents return completion asynchronously to the parent session. Use `/goal` or Kanban when work must survive beyond the active parent process.

## Automation Blueprint Usage

Use Hermes `/blueprint` for time-based or form-filled recurring automations. Do not use it as a generic worker primitive.

Use Lightbulb background subagents for immediate automation:

- request arrives in Discord/TUI/API
- parent creates or selects an isolated worktree
- parent dispatches `lightbulb-*` workers through `task`
- workers return concise evidence asynchronously
- parent verifies and decides whether to ship

If the work must keep running after the parent process can die, promote it to `/goal` or Kanban. Add cron only for actual schedules.

## Prompt Examples

### Locator

```text
Repo: /home/cyberjanitor/worktrees/lightbulb-slice
Goal: find the files involved in browser-use steering.
Do not analyze or suggest changes. Return grouped paths with file:line evidence for entry points.
```

### Researcher

```text
Repo: /home/cyberjanitor/worktrees/lightbulb-slice
Goal: explain how TaskTool dispatches subagents today.
Read the relevant files and return current behavior only, with file:line references. No recommendations.
```

### Implementer

```text
Repo: /home/cyberjanitor/worktrees/lightbulb-slice
Goal: add the minimal delegation command/agent config described in the ticket.
Only edit .opencode/ and .agents/ files unless evidence shows code changes are required.
Run focused validation and report files changed plus command output.
```

### Reviewer

```text
Repo: /home/cyberjanitor/worktrees/lightbulb-slice
Goal: review the current branch diff against origin/dev for correctness, repeated work, and test gaps.
Do not edit files. Return blocking issues first with file:line references.
```
