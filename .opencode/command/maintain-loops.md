---
description: Maintain Lightbulb loops through no-cron async delegation.
---

Use the `lightbulb-loop-maintainer` skill to inspect and repair Lightbulb loop machinery for:

$ARGUMENTS

Rules:

- do not create a recurring cron job
- before background dispatch, require `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` or `OPENCODE_EXPERIMENTAL=true`; otherwise run the lane in the foreground
- use async delegation for independent config/state/repo inspection lanes only after that flag check passes
- make only small reversible fixes
- verify before reporting
- keep output to fixed / blocked / evidence
