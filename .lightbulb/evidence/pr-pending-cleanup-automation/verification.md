# Upstream-only automation cleanup evidence

- Branch: `cleanup-automation`
- Issue: #45
- Captured: 2026-06-21T19:06:45Z

## Behavior evidence

- Removed or disabled inherited workflows that could publish, release, triage, or mutate upstream OpenCode surfaces.
- `github/action.yml` now fails fast with an unsupported Lightbulb action message instead of installing upstream OpenCode.
- `script/raw-changelog.ts` now requires explicit `GH_REPO` so changelog generation cannot silently target `anomalyco/opencode`.
- `docs/lightbulb/rebrand-and-cleanup-inventory.md` records which upstream-only automation was removed or deferred.

## Gate results

From the repository root:

- `git diff --check` — passed.
- `git grep -n "anomalyco/opencode" -- 'script/**' 'github/**' '.github/**'` — no matches.
- `git grep -n "opencode github run" -- 'github/**' '.github/**' 'script/**'` — no matches.
- Deleted-path reference scan for `script/beta.ts`, `script/stats.ts`, `script/github/close-issues.ts`, and `script/github/close-prs.ts` — no live references outside the inventory.
- `bun script/raw-changelog.ts --help` — passed and documents required `GH_REPO`.
- `bun script/raw-changelog.ts` without `GH_REPO` — exited 1 with the expected guard message.

Package-local typecheck was not required; this slice deletes root workflow/script/action surfaces and only smoke-checks the retained root TypeScript script.

## Evidence artifacts

- `terminal-screenshot.svg`
- `explainer.html`
