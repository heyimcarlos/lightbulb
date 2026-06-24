# Issue 81 Verification

## Scope

- Added a durable human inbox projection for review approvals, needs-info items, conflicts, stale-worker holds, budget holds, max-attempt PR review routes, reroute proposals, and ownership collisions.
- Surfaced the digest through dashboard JSON/text output, operations snapshots, operator exports, and the desktop stable-v0 dashboard ready-human-action field.
- Added desktop QA scroll targeting so screenshot evidence can capture the lower Human Action panel.

## Commands

- `cd packages/core && bun test test/lightbulb-human-inbox.test.ts test/lightbulb-operations-snapshot.test.ts test/lightbulb-operator-export.test.ts` - pass, 7 tests.
- `cd packages/core && bun typecheck` - pass.
- `cd packages/opencode && bun test test/cli/lightbulb.test.ts` - pass, 12 tests.
- `cd packages/opencode && bun typecheck` - pass.
- `cd packages/desktop && bun typecheck` - pass.
- `git diff --check` - pass.
- `OPENCODE_DB=/tmp/lightbulb-human-inbox-final.db ./packages/opencode/bin/lightbulb dashboard --seed --format json` - pass, seeded dashboard reports one ready `approval_needed` human action.

## Visual Evidence

- `.lightbulb/evidence/desktop-human-inbox-qa/lightbulb-dashboard.png` - desktop stable-v0 dashboard renders the seeded goal/route/run/worker/gate state.
- `.lightbulb/evidence/desktop-human-inbox-action-qa/lightbulb-dashboard.png` - scrolled desktop dashboard renders the Human Action card with the approval-needed inbox item.

## Notes

- No raw worker transcripts are stored in the inbox, operations snapshot, operator export, or desktop read model.
- The desktop QA scroll selector is only active when `OPENCODE_DESKTOP_QA=1` and `OPENCODE_DESKTOP_QA_SCROLL_SELECTOR` is set.
