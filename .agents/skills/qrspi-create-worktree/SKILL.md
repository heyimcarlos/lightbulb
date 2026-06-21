---
name: qrspi-create-worktree
description: Create an isolated git worktree and launch an implementation session from an approved plan.
disable-model-invocation: true
model: opus
---

# Create Worktree & Launch Implementation

You are setting up an isolated git worktree for implementation and optionally launching a `humanlayer launch` session to execute the plan. This connects the QRSPI planning pipeline to actual code execution.

## Getting Started

When this skill is triggered:

1. **If a plan file path was provided**: Read it to extract context (ticket ID, feature name), then proceed to worktree setup.
2. **If no input was provided**, respond with:
   ```
   I'll set up a worktree for implementation.

   Please provide the path to the approved plan (e.g., `thoughts/shared/plans/YYYY-MM-DD-[ticket-id]-plan.md`).
   ```
   Then wait for input.

## Process

### Step 1: Read the Plan and Determine Details

1. Read the plan file fully.
2. Extract:
   - **Ticket ID / feature name**: From the plan's header or references section
   - **Branch action type**: `feature`, `fix`, or `hotfix` based on the ticket type
3. Read `~/scripts/create_worktree.sh` to confirm current argument format and behavior.

### Step 2: Determine Worktree Parameters

Compose the worktree details:

- **Worktree name**: `<action>/<short-description>` (e.g., `feature/parent-child-tracking`, `fix/mcp-keepalive`)
- **Base branch**: Current branch (default) or `main` — ask if unclear
- **Plan file path**: Relative `thoughts/` path only (thoughts are synced across worktrees)
- **Thoughts init**: `true` unless the project doesn't use the thoughts system

The create script will place the worktree at: `~/wt/<repo-name>/<worktree-name>/`

### Step 3: Confirm with User

Present ALL details before executing anything:

```
I'll create a worktree with these details:

**Worktree name**: <worktree-name>
**Branch**: <worktree-name> (from <base-branch>)
**Worktree path**: ~/wt/<repo-name>/<worktree-name>
**Plan file**: <relative thoughts/shared/plans/ path>
**Thoughts**: will be initialized and synced

**Create command**:
    ~/scripts/create_worktree.sh <worktree-name> <base-branch>

**Launch command** (after worktree is ready):
    humanlayer launch --model opus -w ~/wt/<repo-name>/<worktree-name> \
      "/rpi:implement_plan at <plan-path> and when you are done implementing and all tests pass, run /rpi:commit and create a commit, then run /rpi:describe_pr and create a PR"

Does this look right? I'll create the worktree and launch after your confirmation.
```

### Step 4: Create the Worktree

After user confirmation:

1. Run `~/scripts/create_worktree.sh <worktree-name> <base-branch>`
2. Wait for the script to complete (it handles branch creation, dependency setup, and thoughts init).
3. If the script fails, present the error and suggest fixes.

### Step 5: Launch Implementation Session

After the worktree is created successfully:

1. Run the `humanlayer launch` command with the confirmed parameters.
2. The launched session will:
   - Execute the plan phase by phase
   - Pause at each phase checkpoint for manual verification
   - Commit when all phases pass
   - Create a PR with a description

```
Worktree created and implementation session launched:
- Worktree: ~/wt/<repo-name>/<worktree-name>
- Branch: <worktree-name>
- Session is running with the plan at <plan-path>

The implementation session will pause at each phase checkpoint for your manual verification.

When done, clean up with: ~/scripts/cleanup_worktree.sh <worktree-name>
```

## Guidelines

- Always confirm details before creating the worktree. Creating a worktree is a side-effecting operation.
- Use ONLY relative `thoughts/` paths in the launch prompt — thoughts are synced and accessible from the worktree.
- The launch command chains: implement → commit → PR. Adapt the chain based on what commands are available (check if `/rpi:commit`, `/rpi:describe_pr` exist, fall back to `/commit`, `/describe_pr`).
- If the user doesn't want to launch immediately (just wants the worktree), skip Step 5 and present the launch command for later use.
- If the project doesn't use `humanlayer launch`, just create the worktree and tell the user to `cd` into it.
