# PR 65 Verification

Issue: #65 read-only PR review goal candidate discovery

Worktree: `/home/ren/wt/lightbulb/pr-candidates`

## Commands

- `cd packages/core && bun test test/lightbulb-pr-review-candidate.test.ts test/lightbulb.test.ts`
- `cd packages/core && bun typecheck`
- `cd packages/core && bun run script/migration.ts --check`
- `cd packages/opencode && bun test test/cli/lightbulb.test.ts`
- `cd packages/opencode && bun typecheck`
- `git diff --check origin/dev...HEAD`

## Results

- Focused PR candidate and dashboard regression tests: 25 pass, 0 fail.
- Core typecheck: passed.
- Core migration check: passed.
- Lightbulb CLI dashboard tests: 9 pass, 0 fail.
- Lightbulb CLI package typecheck: passed.
- Whitespace check: passed.

## Read-Model Evidence

The focused test `discovers read-only PR review candidates and exposes bounded dashboard summaries` verifies that `dashboard.inbox.prReviewCandidates` contains a candidate summary with repository, PR number, URL, base/head refs, head SHA, route seed, freshness timestamps, and bounded evidence.

The same test verifies no goals, runs, or workers are created by discovery, and that raw candidate metadata does not appear in the dashboard JSON.

The CLI dashboard formatter now renders PR-review candidate summaries in the Queue section as bounded handles instead of raw metadata.

## Visual Evidence

- `terminal-screenshot.svg` captures the verification summary for the PR review surface.
