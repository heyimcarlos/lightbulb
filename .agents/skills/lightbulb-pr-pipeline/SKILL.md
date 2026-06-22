---
name: lightbulb-pr-pipeline
description: Drive each Lightbulb PR through triage, maker thread, independent reviewer thread, Codex/GitHub review polling, approval loop, merge, and next-slice dispatch. Use when the user asks for a PR workflow, autonomous PR conveyor, review loop, or maker/reviewer thread pipeline.
---

# Lightbulb PR Pipeline

Use this under `lightbulb-maintainer-orchestrator` after queue triage chooses a bounded Lightbulb issue or PR slice.

## Ground Rules

- Parent/root owns queue order, GitHub mutation decisions, final merge, issue closeout, and next-slice dispatch.
- Maker thread owns implementation in a fresh `origin/dev` worktree and short branch.
- Reviewer thread is separate, read-only, and cannot edit the maker worktree.
- Do not reuse the maker thread as the reviewer; no worker self-approval.
- Every PR needs visual evidence when UI, desktop, browser, or CLI output can be affected: screenshot, recording, browser artifact, terminal transcript, or explicit `not applicable` rationale.
- Respect authorization gates: triage/read, local implementation, commit, push/open PR, CI rerun, merge/close, release/tag/publish.
- Stop at the last authorized gate if permission is missing.
- A maker may push or open a PR only when parent/root explicitly authorizes that mutation for the selected branch. Parent/root still owns merge, closeout, and next-slice dispatch.

## Workflow

1. Triage the live queue with `lightbulb-github-project-triage`; capture full GitHub URLs, labels, merge state, review state, checks, and blockers.
2. Pick one bounded slice. If it is too large for one PR, file or update smaller issues before starting implementation.
3. Spin up a maker thread with `lightbulb-delegate`: fresh worktree from `origin/dev`, exact objective, allowed files, forbidden actions, verification commands, visual evidence requirement, and PR title convention.
4. Maker implements, verifies, commits, pushes, and opens a draft or ready PR against `dev` when parent/root has authorized that mutation.
5. Parent records the PR URL, reads the diff, and runs or delegates `thermo-nuclear-code-quality-review` against the PR branch.
6. Spin up a separate read-only reviewer thread; it reviews the filed PR diff against `origin/dev` for correctness, regression risk, missing tests, missing visual evidence, and duplicate agent/skill/command artifacts. Use `review` or `thermo-nuclear-code-quality-review` as inputs when the scope calls for them, but keep the reviewer thread separate from the maker.
7. Parent records the current PR head SHA, requests external review using the available GitHub/Codex path for that head, then polls PR reviews, comments, checks, and merge state until a decision, timeout, or infrastructure blocker is clear. Stale reviews or comments from older head SHAs are context only.
8. Feed actionable comments and failing checks back to the maker thread. Maker fixes in the same branch, reruns focused verification, pushes, and returns evidence plus the new head SHA.
9. After every maker push, parent records the new head SHA, re-requests or refreshes external review for that head, and asks the reviewer thread to re-check the changed diff when needed.
10. Repeat review polling plus maker fixes until approvals and required Codex/external review are tied to the current head SHA, no blocking reviewer findings remain, checks for the current head are green or explicitly owner-waived, and visual evidence is attached.
11. Parent re-reads the PR, confirms the final head SHA matches the reviewed and checked head, verifies the merge gate, merges when authorized, posts issue proof comments when mutating GitHub, then starts the next queued slice in a new maker thread.

## Hard Stops

- Conflicting user or worker changes touch the same files without a clear owner.
- The PR has unresolved requested changes, unknown failing checks, infra-blocked checks without an explicit owner waiver, merge conflicts, missing visual evidence, stale reviews or checks that are not tied to the current head SHA, or no approval path.
- The branch contains broad cleanup unrelated to the selected slice.
- GitHub mutation or merge permission is absent.
- Runtime proof is unavailable for a user-facing path and no acceptable rationale exists.

## Maker Prompt Contract

Include:

- repo/worktree path, branch, base `origin/dev`, and target PR URL or issue URL
- exact slice, allowed mutation boundary, and forbidden actions
- focused verification commands and required visual evidence
- instruction to loop on parent-provided comments until approval-ready
- required output: result, files changed, verification, visual evidence, PR URL, head SHA after push, blockers

## Reviewer Prompt Contract

Include:

- PR URL, base/head refs, and local checkout path
- instruction to review only and make no edits
- scope: correctness, regressions, tests, visual proof, duplicate artifacts, maintainability
- required output: verdict, blocking issues, non-blocking issues, verification reviewed, residual risk

## Parent Closeout

After each PR, append a compact maintainer note or Lightbulb artifact with:

- issue/PR URL, branch, final head SHA, merge SHA if merged
- maker thread evidence and reviewer thread verdict
- checks, approvals, reviewed/check head SHA, visual evidence location, and unresolved caveats
- next selected slice or exact reason the pipeline stopped
