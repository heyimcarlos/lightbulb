# Long-Running Goal: Lightbulb Orchestration Bootstrap

You are an xhigh Codex worker operating inside `/home/cyberjanitor/repos/lightbulb` on branch `lightbulb-orchestration`.

Mission: build the first vertical slice of Lightbulb as an account-level loop/goal orchestration harness on top of the OpenCode fork.

Mandatory rules:

- Respect `AGENTS.md` and nested instructions.
- Do not push, open PRs, merge, or modify upstream remotes.
- Do not collapse all work into parent context; write findings and outputs to files under `docs/lightbulb/` and `.lightbulb/runs/`.
- Use GitHub issues and PRD/ADR docs as the planning spine.
- Implement through vertical tracer bullets, not horizontal layers.
- Prefer real behavior tests over mocks.
- Run package-local verification only; do not run root `npm test`/`bun test` from repo root.
- Leave a final report in `.lightbulb/runs/orchestrator-final.md`.

Desired proof:

1. Durable Lightbulb account schema exists separately from OpenCode session schema.
2. Seed or test creates a goal → loop → run → worker → artifact graph.
3. A dashboard/view can render the seeded graph or a narrow real graph.
4. Artifact objects have producer/consumer lineage.
5. Context/gate policy exists as a tested state transition.
