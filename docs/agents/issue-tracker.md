# Agent Issue Tracker Configuration

This repository uses **GitHub Issues** as the canonical request and triage surface.

- Repository: `heyimcarlos/lightbulb`
- Upstream substrate: `anomalyco/opencode`
- Default branch: `lightbulb`
- Upstream opencode fork base: `dev`
- Working branch for orchestration bootstrap: `lightbulb-orchestration`
- CLI: `gh`
- External PRs as triageable request surface: **no for v0**. Treat PRs as review artifacts unless a maintainer explicitly routes one into triage.

## Agent workflow contract

1. Convert conversation or research into a PRD issue first when the work is product-shaped.
2. Split approved PRDs into vertical-slice GitHub issues using tracer bullets.
3. Mark fully specified implementation slices `ready-for-agent`.
4. Run implementation from issue-backed branches/worktrees, not from vague prompts.
5. Keep parent/orchestrator context clean: workers return summaries plus artifact handles, not raw logs.
