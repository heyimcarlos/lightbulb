---
name: lightbulb-delegate
description: Delegate Lightbulb work to project subagents in isolated worktrees with concise evidence contracts.
---

# Lightbulb Delegate

Use this when work is too broad for the main context and should be split across Lightbulb subagents.

## Non-negotiables

- Use a fresh git worktree for implementation or destructive investigation.
- Do not spawn workers against the shared `dev` checkout.
- Do not use OpenCode/Codex wording in user-facing output; call this Lightbulb.
- Keep parent output short. Workers return compressed evidence, not transcripts.
- No duplicate agents: use the `lightbulb-*` project subagents for delegation and the `.agents/skills/*` skills for reusable procedures.
- Prefer Hermes async delegation for no-cron automation. Do not add a recurring cron job unless the trigger is genuinely time-based.

## Worker roles

- `lightbulb-locator`: find files and ownership boundaries. No code analysis.
- `lightbulb-researcher`: explain current implementation with file:line evidence. No fixes.
- `lightbulb-implementer`: make focused code/docs changes in the assigned worktree.
- `lightbulb-reviewer`: review a diff for correctness, regressions, and missing tests. No edits.

## Delegation protocol

### 1. Classify the work

Use workers only when at least one is true:

- The task spans multiple components.
- The parent would need to read many files.
- The task has independent research/review/implementation lanes.
- The user asked for parallel work, loops, or Lightbulb agents.

Do it yourself when the task is a single file read, a tiny patch, or a direct CLI check.

### 2. Create or select an isolated worktree

For implementation work, create a branch from `origin/dev` with a short branch name:

```bash
git fetch origin dev
git worktree add -b lightbulb-slice /home/cyberjanitor/worktrees/lightbulb-slice origin/dev
```

If a worktree already exists for the issue, verify it first:

```bash
git status --short --branch
git log --oneline --max-count=3
```

### 3. Dispatch workers with explicit contracts

Each worker prompt must include:

- repo path / worktree path
- exact goal
- allowed files or directories when known
- forbidden actions
- required output shape
- verification command expected from the worker, if any

Use parallel `task` calls only for non-overlapping work. Do not ask two workers to edit the same files.

For Hermes-hosted automation, use async delegation instead of cron when the work is event/request driven:

```python
delegate_task(tasks=[
  {
    "goal": "Locate the Lightbulb files involved in the requested slice",
    "context": "Repo: /home/cyberjanitor/worktrees/lightbulb-slice. Return file:line evidence only.",
    "toolsets": ["file"]
  },
  {
    "goal": "Review the current branch against origin/dev",
    "context": "Repo: /home/cyberjanitor/worktrees/lightbulb-slice. No edits. Return blockers first.",
    "toolsets": ["terminal", "file"]
  }
])
```

Current Hermes 0.17 delegation returns completion asynchronously to the parent session. Use this for no-cron maintainer/review/research work. Use `/goal` or Kanban when the work must survive beyond the active parent process.

### 4. Required worker output

Every worker must return this shape:

```markdown
## Result
[one paragraph]

## Evidence
- `path:line` — finding or change

## Files changed
- `path` — why

## Verification
- `command` — pass/fail and key output

## Blockers
- none, or concrete blocker
```

Implementation workers must also report the branch name and commit SHA if they committed.

### 5. Parent verification

The parent must verify claims before reporting success:

- Read changed files or inspect diff.
- Run focused tests from package directories, never from repo root.
- For PR work, run `git diff --check`.
- Confirm `git status --short --branch`.

### 6. Shipping

If the user asked to proceed through PR:

1. Commit only relevant files.
2. Push the branch.
3. Open a PR against `dev`.
4. Report PR URL, verification, and caveats.

## Automation blueprint usage

Use Hermes `/blueprint` for time-based or form-filled recurring automations. Do not use it as a generic "make a worker" primitive.

Use Hermes async delegation for immediate automation:

- request arrives in Discord/TUI/API
- parent creates/selects an isolated worktree
- parent dispatches `lightbulb-*` workers through `delegate_task`
- workers return concise evidence asynchronously
- parent verifies and decides whether to ship

If the work must keep running after the parent process can die, promote it to `/goal` or Kanban. Add cron only for actual schedules.

## Example task prompts

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
Goal: review the current branch diff against origin/dev for correctness, duplicates, and test gaps.
Do not edit files. Return blocking issues first with file:line references.
```
