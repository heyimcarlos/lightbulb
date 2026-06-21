# Upstream-only automation cleanup evidence

- Branch: `cleanup-automation`
- Issue: #45
- Captured: 2026-06-21T19:06:45Z

## Behavior evidence

- Removed or disabled inherited workflows that could publish, release, triage, or mutate upstream OpenCode surfaces.
- `github/action.yml` now fails fast with an unsupported Lightbulb action message instead of installing upstream OpenCode.
- `opencode github install` now fails fast with an unsupported Lightbulb installer message instead of opening the upstream OpenCode app or writing an upstream workflow.
- The inherited VS Code marketplace publish workflow was removed so Lightbulb tags or manual dispatches cannot publish the upstream `opencode` extension.
- `script/raw-changelog.ts` now requires explicit `GH_REPO` so changelog generation cannot silently target `anomalyco/opencode`.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` records which upstream-only automation was removed or deferred.

## Gate results

From the repository root:

- `git diff --check` — passed.
- `git grep -n "anomalyco/opencode" -- 'script/**' 'github/**' '.github/**'` — no matches.
- `git grep -n "opencode github run" -- 'github/**' '.github/**' 'script/**'` — no matches.
- `git grep -n "VSCE_PAT\|OPENVSX_TOKEN\|publish-vscode" -- '.github/workflows'` — no matches.
- `packages/opencode`: `OPENCODE_DB=/tmp/lightbulb-pr54-install.sqlite bun src/index.ts github install` — exited 1 with the expected Lightbulb unsupported installer message.
- `packages/opencode`: `bun test test/cli/help/help-snapshots.test.ts test/cli/github-action.test.ts --timeout 30000` — 18 pass, 0 fail.
- `packages/opencode`: `bun test test/cli/lightbulb.test.ts --timeout 30000` — 5 pass, 0 fail.
- `packages/opencode`: `bun typecheck` — passed.
- Deleted-path reference scan for `script/beta.ts`, `script/stats.ts`, `script/github/close-issues.ts`, and `script/github/close-prs.ts` — no live references outside the inventory.
- `bun script/raw-changelog.ts --help` — passed and documents required `GH_REPO`.
- `bun script/raw-changelog.ts` without `GH_REPO` — exited 1 with the expected guard message.

Package-local typecheck was not required; this slice deletes root workflow/script/action surfaces and only smoke-checks the retained root TypeScript script.

## Evidence artifacts

- `terminal-screenshot.svg`
- `explainer.html`
