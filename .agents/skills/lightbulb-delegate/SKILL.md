---
name: lightbulb-delegate
description: Delegate Lightbulb research, implementation, and review to worker subagents in isolated worktrees with concise evidence contracts. Use when work spans multiple components, needs parallel lanes, or another Lightbulb skill asks for workers.
---

# Lightbulb Delegate

Use this when work is too broad for the main context and should be split across Lightbulb workers. For role-specific prompts and automation examples, read [REFERENCE.md](REFERENCE.md) when choosing a lane or writing a worker prompt.

## Non-Negotiables

- Use a fresh git worktree for implementation or destructive investigation.
- Do not spawn workers against the shared `lightbulb` checkout.
- Do not use OpenCode/Codex wording in user-facing output; call this Lightbulb.
- Keep parent output short. Workers return compressed evidence, not transcripts.
- Do not create redundant agents: use `lightbulb-*` project subagents for delegation and `.agents/skills/*` skills for reusable procedures.
- Use background workers for request-driven automation; use time-based scheduling only when the trigger is genuinely time-based.

## Worker Roles

- `lightbulb-locator`: find files and ownership boundaries. No code analysis.
- `lightbulb-researcher`: explain current implementation with file:line evidence. No fixes.
- `lightbulb-implementer`: make focused code/docs changes in the assigned worktree.
- `lightbulb-reviewer`: review a diff for correctness, regressions, and missing tests. No edits.

## Delegation Protocol

### 1. Classify the work

Use workers only when the task spans components, would force the parent to read many files, has independent research/review/implementation lanes, or the user asked for parallel work, loops, or Lightbulb agents.

Do it yourself when the task is a single file read, a tiny patch, or a direct CLI check. Classification is done when every proposed worker has a distinct role and non-overlapping file ownership.

### 2. Create or select an isolated worktree

For implementation work, create a branch from `origin/lightbulb` with a short branch name:

```bash
git fetch origin lightbulb
git worktree add -b lightbulb-slice /home/cyberjanitor/worktrees/lightbulb-slice origin/lightbulb
```

If a worktree already exists for the issue, verify `git status --short --branch` and recent commits before reusing it. This step is done when each mutating worker has exactly one isolated repo path.

### 3. Dispatch workers with explicit contracts

Each worker prompt must include repo/worktree path, exact goal, allowed files or directories, forbidden actions, required output shape, and expected verification command.

Before dispatching with `background: true`, verify the Lightbulb process has enabled background subagents:

```bash
test "${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-${OPENCODE_EXPERIMENTAL:-}}" = "true"
```

If the check fails, enable the background-subagent flag for the Lightbulb process, or omit `background: true` and keep the lane in the foreground. Dispatch is done when every worker has a bounded contract and no two mutating workers can edit the same files.

### 4. Require worker evidence

Every worker must return:

```markdown
## Result
[one paragraph]

## Evidence
- `path:line` - finding or change

## Files changed
- `path` - why

## Verification
- `command` - pass/fail and key output

## Blockers
- none, or concrete blocker
```

Implementation workers must also report branch name and commit SHA if they committed. This step is done when the parent has a concise result, file evidence, verification status, and blocker state for every worker.

### 5. Parent verifies before closeout

Read changed files or inspect the diff, run focused package-local tests, run `git diff --check` for PR work, and confirm `git status --short --branch`.

If the user asked to proceed through PR, commit only relevant files, push the branch, open a PR against `lightbulb`, and report PR URL, verification, and caveats. Closeout is done only after the parent has independently checked the worker claims.
