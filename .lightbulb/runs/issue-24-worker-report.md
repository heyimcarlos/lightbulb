# Issue 24 worker report (recovered by parent failure-debug loop)

Original child final output stated it could not write `/home/cyberjanitor/.hermes/state/lightbulb-issue-orchestrator/runs/issue-24/worker-report.md` because that path was outside the Codex workspace-write sandbox and wrote a fallback to `/tmp/lightbulb-issue-24-worker-report.md` instead. The `/tmp` fallback is no longer present, so the parent recovered the durable report from `~/.hermes/state/lightbulb-issue-orchestrator/runs/issue-24/final.md`.

Key additions reported by worker:
- `packages/core/src/lightbulb/decision-artifact.ts`: decision registration, transitions, issue classification, dispatch skip planning.
- `packages/core/test/lightbulb-decision-artifact.test.ts`: focused tests for accepted ADR, unresolved hold, superseded replacement, rejected decision, and dispatch skip.
- `docs/lightbulb/adr/0005-decision-artifact-routing.md`: ADR note for decision artifacts, gates, and AFK routing.
- Extended artifact types for `design_discussion` and `html_decision`, and parent summaries expose compact decision artifact handles.

Worker-reported verification blockers before parent recovery:
- `git diff --check` passed.
- `bun test test/lightbulb-decision-artifact.test.ts` blocked: missing `effect`.
- `bun typecheck` blocked: `tsgo: command not found`.
- Offline install failed because cache was incomplete and network was disabled.

Parent recovery recorded in orchestrator state:
- Dependencies were materialized parent-side.
- Parent reproduced and fixed the core return-shape/typecheck issue and stale opencode CLI artifact fixtures.
- Parent verified `packages/opencode bun test test/cli/lightbulb.test.ts`, `packages/opencode bun typecheck`, and `git diff --check`.

Current script prompt has been patched so future workers write reports inside the sandboxed worktree at `.lightbulb/runs/issue-<n>-worker-report.md`.
