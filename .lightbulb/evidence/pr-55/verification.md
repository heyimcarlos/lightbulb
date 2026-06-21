# Lightbulb public repo identity evidence

- Branch: `repo-identity`
- Issue: #46
- Captured: 2026-06-21T19:09:41Z

## Behavior evidence

- `README.md` starts with Lightbulb and explains OpenCode as the execution/session substrate.
- Localized upstream README copies are replaced with short stubs pointing to canonical `README.md`, avoiding stale upstream install/community instructions.
- Root private package metadata now names/describes Lightbulb and points repository metadata at `heyimcarlos/lightbulb`.
- The documented `lightbulb` command from issue #44 is real on current `origin/dev`.

## Gate results

From the repository root unless noted:

- `git diff --check` — passed.
- `git grep -n "opencode.ai\|anomalyco/opencode\|OpenCode" -- README.md README.*.md package.json docs/lightbulb` — only intentional substrate/inventory references remain.
- `packages/opencode`: `OPENCODE_DB=/tmp/lightbulb-issue46-smoke.sqlite ./bin/lightbulb --help` — passed.
- `packages/opencode`: `OPENCODE_DB=/tmp/lightbulb-issue46-smoke.sqlite ./bin/lightbulb dashboard --help` — passed.
- `packages/opencode`: `OPENCODE_DB=/tmp/lightbulb-issue46-smoke.sqlite ./bin/lightbulb dashboard --seed --format json` — passed.

## Evidence artifacts

- `lightbulb-help.txt`
- `lightbulb-dashboard-help.txt`
- `lightbulb-dashboard.json`
- `terminal-screenshot.svg`
- `explainer.html`
