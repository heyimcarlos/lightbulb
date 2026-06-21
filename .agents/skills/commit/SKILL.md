---
name: commit
description: Create focused git commits with user approval, exact-file staging, Conventional Commit style, and no AI attribution.
---

# Commit

Use this skill when the user asks you to commit local changes.

## Workflow

1. Inspect the worktree.
   - Consider the session context.
   - Run `git status --short`.
   - Run `git diff` and, when staged changes exist, `git diff --cached`.
   - Identify unrelated or user-owned changes and leave them unstaged.

2. Split commits by intent.
   - Prefer one commit per coherent change.
   - Split unrelated docs, tests, source changes, generated artifacts, or cleanup.
   - Keep each commit independently understandable and ideally working.
   - Do not split so finely that review becomes noisy.

3. Draft concise messages.
   - Use Conventional Commit shape: `<type>(<scope>): <imperative summary>`.
   - Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`.
   - Keep the subject short, normally under 72 characters.
   - Add a body only when the reason or migration impact is not obvious.
   - Never add AI attribution, `Generated with ...`, or `Co-authored-by` trailers.

4. Present the plan and stop.
   - List each planned commit with message and exact files.
   - Ask: `I plan to create N commit(s) with these changes. Shall I proceed?`
   - Do not stage or commit until the user confirms.

5. Commit after confirmation.
   - Stage exact files with `git add -- <file> ...`; never use `git add -A`, `git add .`, or broad globs.
   - Commit with the approved message.
   - If multiple commits are planned, repeat exact staging per commit.
   - Show `git log --oneline -n N` after committing.

## Guardrails

- If there are pre-existing staged changes, treat them as user-owned; include them only if the user approves.
- If the diff includes secrets, broken generated output, or unrelated edits, pause and call it out.
- Write commits as if the user authored them.
- Do not amend, rebase, reset, stash, or discard changes unless the user explicitly asks.
