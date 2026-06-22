---
description: Run the Lightbulb PR pipeline with maker and reviewer threads, review polling, approval loop, merge gate, and next-slice dispatch.
---

Use the `lightbulb-pr-pipeline` skill to process this PR or queue slice:

$ARGUMENTS

Follow the skill exactly:

- triage the live queue first
- spin up one maker thread in an isolated worktree
- spin up a separate read-only reviewer thread after the PR is filed
- request and poll external review/checks
- loop maker fixes until approvals and gates are clean
- merge only from the parent thread when authorized
- start the next slice in a new maker thread after merge
