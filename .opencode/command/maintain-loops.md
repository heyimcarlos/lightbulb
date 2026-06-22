---
description: Maintain Lightbulb loops through no-cron async delegation.
---

Use the `lightbulb-loop-maintainer` skill to inspect and repair Lightbulb loop machinery for:

$ARGUMENTS

Rules:

- do not create a recurring cron job
- use async delegation for independent config/state/repo inspection lanes
- make only small reversible fixes
- verify before reporting
- keep output to fixed / blocked / evidence
