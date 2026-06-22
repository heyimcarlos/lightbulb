---
description: Start no-cron Lightbulb automation by delegating request-driven work to async workers.
---

Start a no-cron Lightbulb automation for:

$ARGUMENTS

Use `lightbulb-delegate`, then dispatch through async delegation instead of creating a scheduled job.

Required behavior:

1. Create or verify an isolated worktree if edits may happen.
2. Dispatch only non-overlapping worker lanes.
3. Prefer these workers:
   - `lightbulb-locator` for file maps
   - `lightbulb-researcher` for current behavior
   - `lightbulb-implementer` for focused edits
   - `lightbulb-reviewer` for no-edit review
4. Require worker summaries with evidence, changed files, verification, and blockers.
5. Parent verifies results before claiming success.

Do not create a cron job. If the task is actually recurring on a schedule, stop and say it should be a blueprint/cron automation instead.
