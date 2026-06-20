# Triage Label Vocabulary

Matt Pocock engineering skills assume a stable triage vocabulary. This repository maps the canonical states directly to GitHub labels.

| Canonical state | GitHub label | Meaning |
| --- | --- | --- |
| needs triage | `needs-triage` | Maintainer/orchestrator must classify and route. |
| needs info | `needs-info` | Waiting on reporter/user/context before an AFK agent can act. |
| ready for agent | `ready-for-agent` | Fully specified and safe for an AFK agent/Codex worker. |
| ready for human | `ready-for-human` | Needs human design or implementation. |
| won't fix | `wontfix` | Intentionally not actioned. |

Additional domain labels:

- `prd` — product requirements document
- `adr` — architecture decision record
- `loop-harness` — Lightbulb harness work
- `orchestration` — goals, schedules, workers, run control
- `artifact-flow` — bidirectional artifacts and lineage
- `context-rot` — context isolation, delegation, compaction, handoff
- `spike` — research/prototype spike
