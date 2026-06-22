---
description: Run the Lightbulb PR pipeline with maker and reviewer threads, review polling, approval loop, merge gate, and next-slice dispatch.
---

Use the `lightbulb-pr-pipeline` skill to process this PR or queue slice:

$ARGUMENTS

Follow the skill exactly:

- triage the live queue first
- spin up one maker thread in an isolated worktree
- spin up a separate read-only reviewer thread after the PR is filed
- request and poll external review/checks for the current head SHA
- treat stale reviews/checks from older head SHAs as context only
- after each maker push, record the new head SHA and re-request/re-poll review gates
- loop maker fixes until current-head approvals are present and checks are green or explicitly owner-waived
- merge only from the parent thread when authorized
- start the next slice in a new maker thread after merge
